-- Fix duplicate open/paused deliveries for the same subscription + scheduled_date.
-- Cause: multiple writers (Admin ensure, customer ensure, pause/resume, skip) each do
--   EXISTS-check then INSERT with no lock → race creates 2 opens for the same Sunday.
-- Rule: at most ONE open|paused row per (subscription_id, scheduled_date).
-- Multi-sub later is fine: uniqueness is per subscription, not per user.

-- 1) Deduplicate: keep oldest open/paused row per (subscription_id, scheduled_date); cancel extras
WITH ranked AS (
  SELECT
    d.id,
    ROW_NUMBER() OVER (
      PARTITION BY d.subscription_id, d.scheduled_date
      ORDER BY d.delivery_index ASC, d.id ASC
    ) AS rn
  FROM public.deliveries d
  WHERE d.status IN ('open', 'paused')
)
UPDATE public.deliveries d
SET status = 'cancelled'
FROM ranked r
WHERE d.id = r.id
  AND r.rn > 1;

-- 2) Prevent future duplicates (per subscription + date, only for open/paused)
CREATE UNIQUE INDEX IF NOT EXISTS deliveries_unique_open_paused_per_sub_date
  ON public.deliveries (subscription_id, scheduled_date)
  WHERE status IN ('open', 'paused');

COMMENT ON INDEX public.deliveries_unique_open_paused_per_sub_date IS
  'One open/paused delivery per subscription per scheduled_date. Different subscriptions (same user later) may each have a row.';

-- 3) Safe insert helper: create open/paused for a Sunday or return existing
CREATE OR REPLACE FUNCTION public.ensure_delivery_row_for_sunday(
  p_subscription_id uuid,
  p_week_start date,
  p_week_end date,
  p_status public.delivery_status_enum DEFAULT 'open'
)
RETURNS public.deliveries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_del public.deliveries%ROWTYPE;
  v_next_index integer;
  v_budget numeric;
BEGIN
  IF p_subscription_id IS NULL OR p_week_start IS NULL OR p_week_end IS NULL THEN
    RAISE EXCEPTION 'subscription_id, week_start, week_end required';
  END IF;

  IF p_status IS DISTINCT FROM 'open' AND p_status IS DISTINCT FROM 'paused' THEN
    RAISE EXCEPTION 'ensure_delivery_row_for_sunday only creates open or paused';
  END IF;

  -- Already skipped this week → do not create a competing open
  SELECT d.*
  INTO v_del
  FROM public.deliveries d
  WHERE d.subscription_id = p_subscription_id
    AND d.status = 'skipped'
    AND d.scheduled_date >= p_week_start
    AND d.scheduled_date <= p_week_end
  ORDER BY d.scheduled_date ASC, d.id ASC
  LIMIT 1;

  IF FOUND THEN
    RETURN v_del;
  END IF;

  -- Existing open/paused in week
  SELECT d.*
  INTO v_del
  FROM public.deliveries d
  WHERE d.subscription_id = p_subscription_id
    AND d.status IN ('open', 'paused')
    AND d.scheduled_date >= p_week_start
    AND d.scheduled_date <= p_week_end
  ORDER BY d.scheduled_date ASC, d.id ASC
  LIMIT 1;

  IF FOUND THEN
    IF v_del.status IS DISTINCT FROM p_status THEN
      UPDATE public.deliveries
      SET status = p_status
      WHERE id = v_del.id
      RETURNING * INTO v_del;
    END IF;
    RETURN v_del;
  END IF;

  v_next_index := public.next_delivery_index_for_subscription(p_subscription_id);

  SELECT d.weekly_budget INTO v_budget
  FROM public.deliveries d
  WHERE d.subscription_id = p_subscription_id
  ORDER BY d.scheduled_date DESC, d.delivery_index DESC
  LIMIT 1;

  IF v_budget IS NULL THEN
    v_budget := 0;
  END IF;

  BEGIN
    INSERT INTO public.deliveries (
      subscription_id,
      delivery_index,
      scheduled_date,
      status,
      weekly_budget,
      customizations
    ) VALUES (
      p_subscription_id,
      v_next_index,
      p_week_end,
      p_status,
      v_budget,
      '{}'::jsonb
    )
    RETURNING * INTO v_del;
  EXCEPTION
    WHEN unique_violation THEN
      -- Race: another writer inserted the same open/paused Sunday
      SELECT d.*
      INTO v_del
      FROM public.deliveries d
      WHERE d.subscription_id = p_subscription_id
        AND d.status IN ('open', 'paused')
        AND d.scheduled_date >= p_week_start
        AND d.scheduled_date <= p_week_end
      ORDER BY d.scheduled_date ASC, d.id ASC
      LIMIT 1;
  END;

  RETURN v_del;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_delivery_row_for_sunday(uuid, date, date, public.delivery_status_enum) FROM PUBLIC;

-- Wire customer ensure through the safe helper
CREATE OR REPLACE FUNCTION public.ensure_my_open_delivery_for_week(
  p_week_start date,
  p_week_end date
)
RETURNS public.deliveries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub public.subscriptions%ROWTYPE;
  v_del public.deliveries%ROWTYPE;
  v_want public.delivery_status_enum;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_week_start IS NULL OR p_week_end IS NULL THEN
    RAISE EXCEPTION 'week_start and week_end are required';
  END IF;

  SELECT *
  INTO v_sub
  FROM public.subscriptions s
  WHERE s.user_id = auth.uid()
    AND s.status IN ('active', 'paused')
  ORDER BY s.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active subscription';
  END IF;

  v_want := CASE
    WHEN v_sub.status = 'paused' THEN 'paused'::public.delivery_status_enum
    ELSE 'open'::public.delivery_status_enum
  END;

  v_del := public.ensure_delivery_row_for_sunday(v_sub.id, p_week_start, p_week_end, v_want);

  IF v_sub.status = 'active' AND v_del.status = 'open' THEN
    UPDATE public.subscriptions
    SET next_delivery_date = CASE
          WHEN next_delivery_date IS NULL OR next_delivery_date < p_week_start
            THEN v_del.scheduled_date
          ELSE next_delivery_date
        END,
        updated_at = timezone('utc'::text, now())
    WHERE id = v_sub.id;
  END IF;

  RETURN v_del;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_my_open_delivery_for_week(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_my_open_delivery_for_week(date, date) TO authenticated;

-- Wire admin bulk ensure through the safe helper
CREATE OR REPLACE FUNCTION public.ensure_open_deliveries_for_market_week(
  p_week_start date,
  p_week_end date
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  n int := 0;
  v_before uuid;
  v_after public.deliveries%ROWTYPE;
  v_want public.delivery_status_enum;
  v_entitled integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  IF p_week_start IS NULL OR p_week_end IS NULL THEN
    RAISE EXCEPTION 'week_start and week_end are required';
  END IF;

  FOR r IN
    SELECT
      s.id AS subscription_id,
      s.status AS subscription_status,
      COALESCE(s.deliveries_used, 0) AS deliveries_used,
      COALESCE(sp.entitled_deliveries, 1) AS entitled_deliveries
    FROM public.subscriptions s
    LEFT JOIN public.subscription_plans sp ON sp.id = s.subscription_plan_id
    WHERE s.status IN ('active', 'paused')
  LOOP
    v_entitled := GREATEST(r.entitled_deliveries, 1);
    IF r.deliveries_used >= v_entitled THEN
      CONTINUE;
    END IF;

    v_want := CASE
      WHEN r.subscription_status = 'paused' THEN 'paused'::public.delivery_status_enum
      ELSE 'open'::public.delivery_status_enum
    END;

    SELECT d.id INTO v_before
    FROM public.deliveries d
    WHERE d.subscription_id = r.subscription_id
      AND d.status IN ('open', 'paused')
      AND d.scheduled_date >= p_week_start
      AND d.scheduled_date <= p_week_end
    LIMIT 1;

    v_after := public.ensure_delivery_row_for_sunday(
      r.subscription_id, p_week_start, p_week_end, v_want
    );

    IF v_before IS NULL AND v_after.id IS NOT NULL AND v_after.status IN ('open', 'paused') THEN
      n := n + 1;
      IF r.subscription_status = 'active' THEN
        UPDATE public.subscriptions
        SET next_delivery_date = CASE
              WHEN next_delivery_date IS NULL OR next_delivery_date < p_week_start
                THEN v_after.scheduled_date
              ELSE next_delivery_date
            END,
            updated_at = timezone('utc'::text, now())
        WHERE id = r.subscription_id;
      END IF;
    END IF;
  END LOOP;

  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_open_deliveries_for_market_week(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_open_deliveries_for_market_week(date, date) TO authenticated;

-- Pause/resume: create missing weeks via safe helper (no raw INSERT race)
CREATE OR REPLACE FUNCTION public.set_my_subscription_paused(
  p_paused boolean,
  p_current_week_start date
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub public.subscriptions%ROWTYPE;
  v_new_sub_status public.subscription_status_enum;
  v_new_del_status public.delivery_status_enum;
  v_cur_start date := p_current_week_start;
  v_cur_end date := p_current_week_start + 6;
  v_nxt_start date := p_current_week_start + 7;
  v_nxt_end date := p_current_week_start + 13;
  v_week record;
  v_updated int := 0;
  v_created int := 0;
  v_n int;
  v_prev_status text;
  v_before uuid;
  v_row public.deliveries%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_current_week_start IS NULL THEN
    RAISE EXCEPTION 'current week start is required';
  END IF;

  SELECT *
  INTO v_sub
  FROM public.subscriptions s
  WHERE s.user_id = auth.uid()
    AND s.status IN ('active', 'paused')
  ORDER BY s.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active or paused subscription';
  END IF;

  v_prev_status := v_sub.status::text;
  v_new_sub_status := CASE
    WHEN p_paused THEN 'paused'::public.subscription_status_enum
    ELSE 'active'::public.subscription_status_enum
  END;
  v_new_del_status := CASE
    WHEN p_paused THEN 'paused'::public.delivery_status_enum
    ELSE 'open'::public.delivery_status_enum
  END;

  UPDATE public.subscriptions
  SET status = v_new_sub_status,
      updated_at = timezone('utc'::text, now())
  WHERE id = v_sub.id;

  FOR v_week IN
    SELECT v_cur_start AS week_start, v_cur_end AS week_end
    UNION ALL
    SELECT v_nxt_start, v_nxt_end
  LOOP
    SELECT d.id INTO v_before
    FROM public.deliveries d
    WHERE d.subscription_id = v_sub.id
      AND d.status IN ('open', 'paused')
      AND d.scheduled_date >= v_week.week_start
      AND d.scheduled_date <= v_week.week_end
    LIMIT 1;

    v_row := public.ensure_delivery_row_for_sunday(
      v_sub.id, v_week.week_start, v_week.week_end, v_new_del_status
    );

    IF v_before IS NULL AND v_row.id IS NOT NULL THEN
      v_created := v_created + 1;
    ELSIF v_before IS NOT NULL THEN
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_updated := v_updated + 1;
    END IF;
  END LOOP;

  IF NOT p_paused THEN
    UPDATE public.subscriptions
    SET next_delivery_date = v_cur_end,
        updated_at = timezone('utc'::text, now())
    WHERE id = v_sub.id;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'record_subscription_event') THEN
    PERFORM public.record_subscription_event(
      v_sub.id,
      v_sub.user_id,
      CASE WHEN p_paused THEN 'paused' ELSE 'resumed' END,
      jsonb_build_object(
        'previous_data', jsonb_build_object('status', v_prev_status),
        'new_data', jsonb_build_object('status', v_new_sub_status::text)
      ),
      NULL,
      NULL,
      auth.uid(),
      'subscriber'
    );
  END IF;

  RETURN json_build_object(
    'subscription_id', v_sub.id,
    'subscription_status', v_new_sub_status::text,
    'delivery_status', v_new_del_status::text,
    'deliveries_updated', v_updated,
    'deliveries_created', v_created
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_my_subscription_paused(boolean, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_my_subscription_paused(boolean, date) TO authenticated;

-- Skip: next-week open via safe helper
CREATE OR REPLACE FUNCTION public.skip_my_delivery_this_week(
  p_week_start date,
  p_week_end date
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub public.subscriptions%ROWTYPE;
  v_del public.deliveries%ROWTYPE;
  v_nxt_start date := p_week_end + 1;
  v_nxt_end date := p_week_end + 7;
  v_next public.deliveries%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_week_start IS NULL OR p_week_end IS NULL THEN
    RAISE EXCEPTION 'week_start and week_end are required';
  END IF;

  SELECT *
  INTO v_sub
  FROM public.subscriptions s
  WHERE s.user_id = auth.uid()
    AND s.status = 'active'
  ORDER BY s.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active subscription (resume first if paused)';
  END IF;

  SELECT d.*
  INTO v_del
  FROM public.deliveries d
  WHERE d.subscription_id = v_sub.id
    AND d.status = 'open'
    AND d.scheduled_date >= p_week_start
    AND d.scheduled_date <= p_week_end
  ORDER BY d.scheduled_date ASC, d.id ASC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No open delivery to skip for this week';
  END IF;

  UPDATE public.deliveries
  SET status = 'skipped'
  WHERE id = v_del.id
  RETURNING * INTO v_del;

  v_next := public.ensure_delivery_row_for_sunday(
    v_sub.id, v_nxt_start, v_nxt_end, 'open'::public.delivery_status_enum
  );

  UPDATE public.subscriptions
  SET next_delivery_date = v_next.scheduled_date,
      updated_at = timezone('utc'::text, now())
  WHERE id = v_sub.id;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'record_subscription_event') THEN
    PERFORM public.record_subscription_event(
      v_sub.id,
      v_sub.user_id,
      'skipped',
      jsonb_build_object(
        'previous_data', jsonb_build_object(
          'delivery_status', 'open',
          'scheduled_date', v_del.scheduled_date,
          'next_delivery_date', v_sub.next_delivery_date
        ),
        'new_data', jsonb_build_object(
          'delivery_status', 'skipped',
          'scheduled_date', v_del.scheduled_date,
          'next_delivery_date', v_next.scheduled_date
        )
      ),
      NULL,
      v_del.id,
      auth.uid(),
      'subscriber'
    );
  END IF;

  RETURN json_build_object(
    'delivery_id', v_del.id,
    'scheduled_date', v_del.scheduled_date,
    'status', v_del.status::text,
    'next_delivery_date', v_next.scheduled_date
  );
END;
$$;

REVOKE ALL ON FUNCTION public.skip_my_delivery_this_week(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.skip_my_delivery_this_week(date, date) TO authenticated;

-- Ensure helper for next_delivery_index exists (idempotent)
CREATE OR REPLACE FUNCTION public.next_delivery_index_for_subscription(p_subscription_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(s.deliveries_used, 0) + 1
  FROM public.subscriptions s
  WHERE s.id = p_subscription_id;
$$;

NOTIFY pgrst, 'reload schema';
