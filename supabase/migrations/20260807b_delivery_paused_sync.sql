-- Add deliveries.status = paused; sync pause/resume with current + next week rows;
-- when ensuring deliveries for a market week, create as paused if subscription is paused.


-- ---------------------------------------------------------------------------
-- Pause / resume: subscription + current/next week deliveries (open ↔ paused)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_my_subscription_paused(
  p_paused boolean,
  p_current_week_start date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub_id uuid;
  v_new_sub_status public.subscription_status_enum;
  v_new_del_status public.delivery_status_enum;
  v_cur_start date := p_current_week_start;
  v_cur_end date := p_current_week_start + 6;
  v_nxt_start date := p_current_week_start + 7;
  v_nxt_end date := p_current_week_start + 13;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_current_week_start IS NULL THEN
    RAISE EXCEPTION 'current week start is required';
  END IF;

  SELECT s.id
  INTO v_sub_id
  FROM public.subscriptions s
  WHERE s.user_id = auth.uid()
    AND s.status IN ('active', 'paused')
  ORDER BY s.created_at DESC
  LIMIT 1;

  IF v_sub_id IS NULL THEN
    RAISE EXCEPTION 'No active or paused subscription';
  END IF;

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
  WHERE id = v_sub_id;

  -- Only toggle open ↔ paused for this Mon–Sun and next Mon–Sun
  UPDATE public.deliveries d
  SET status = v_new_del_status
  WHERE d.subscription_id = v_sub_id
    AND d.status IN ('open', 'paused')
    AND (
      (d.scheduled_date >= v_cur_start AND d.scheduled_date <= v_cur_end)
      OR (d.scheduled_date >= v_nxt_start AND d.scheduled_date <= v_nxt_end)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.set_my_subscription_paused(boolean, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_my_subscription_paused(boolean, date) TO authenticated;

COMMENT ON FUNCTION public.set_my_subscription_paused(boolean, date) IS
  'Pause or resume caller subscription; sets current + next week open/paused deliveries to match.';

-- ---------------------------------------------------------------------------
-- Ensure for one week: include paused subs; create open or paused accordingly
-- ---------------------------------------------------------------------------
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
  v_next_index integer;
  v_budget numeric;
  v_entitled integer;
  v_del_status public.delivery_status_enum;
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
      COALESCE(sp.entitled_deliveries, 1) AS entitled_deliveries,
      bt.monthly_price,
      bt.handling_fee
    FROM public.subscriptions s
    LEFT JOIN public.subscription_plans sp ON sp.id = s.subscription_plan_id
    LEFT JOIN public.bucket_types bt ON bt.id = s.bucket_type_id
    WHERE s.status IN ('active', 'paused')
  LOOP
    v_entitled := GREATEST(r.entitled_deliveries, 1);
    IF r.deliveries_used >= v_entitled THEN
      CONTINUE;
    END IF;

    -- Already have open or paused delivery in this market week?
    IF EXISTS (
      SELECT 1
      FROM public.deliveries d
      WHERE d.subscription_id = r.subscription_id
        AND d.status IN ('open', 'paused')
        AND d.scheduled_date >= p_week_start
        AND d.scheduled_date <= p_week_end
    ) THEN
      -- Keep status aligned with subscription (e.g. was open, sub now paused)
      UPDATE public.deliveries d
      SET status = CASE
            WHEN r.subscription_status = 'paused' THEN 'paused'::public.delivery_status_enum
            ELSE 'open'::public.delivery_status_enum
          END,
          updated_at = timezone('utc'::text, now())
      WHERE d.subscription_id = r.subscription_id
        AND d.status IN ('open', 'paused')
        AND d.scheduled_date >= p_week_start
        AND d.scheduled_date <= p_week_end
        AND d.status IS DISTINCT FROM CASE
          WHEN r.subscription_status = 'paused' THEN 'paused'::public.delivery_status_enum
          ELSE 'open'::public.delivery_status_enum
        END;
      CONTINUE;
    END IF;

    SELECT COALESCE(MAX(d.delivery_index), 0) + 1
    INTO v_next_index
    FROM public.deliveries d
    WHERE d.subscription_id = r.subscription_id;

    SELECT d.weekly_budget INTO v_budget
    FROM public.deliveries d
    WHERE d.subscription_id = r.subscription_id
    ORDER BY d.delivery_index DESC
    LIMIT 1;

    IF v_budget IS NULL THEN
      v_budget := ROUND(
        ((COALESCE(r.monthly_price, 0) - COALESCE(r.handling_fee, 0))::numeric)
        / v_entitled,
        2
      );
    END IF;

    v_del_status := CASE
      WHEN r.subscription_status = 'paused' THEN 'paused'::public.delivery_status_enum
      ELSE 'open'::public.delivery_status_enum
    END;

    INSERT INTO public.deliveries (
      subscription_id,
      delivery_index,
      scheduled_date,
      status,
      weekly_budget,
      customizations
    ) VALUES (
      r.subscription_id,
      v_next_index,
      p_week_end,
      v_del_status,
      COALESCE(v_budget, 0),
      '{}'::jsonb
    );

    UPDATE public.subscriptions
    SET next_delivery_date = CASE
          WHEN next_delivery_date IS NULL OR next_delivery_date < p_week_start
            THEN p_week_end
          ELSE next_delivery_date
        END,
        updated_at = timezone('utc'::text, now())
    WHERE id = r.subscription_id
      AND r.subscription_status = 'active';

    n := n + 1;
  END LOOP;

  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_open_deliveries_for_market_week(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_open_deliveries_for_market_week(date, date) TO authenticated;

-- ---------------------------------------------------------------------------
-- Customer ensure: create open or paused for this week
-- ---------------------------------------------------------------------------
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
  v_next_index integer;
  v_budget numeric;
  v_del_status public.delivery_status_enum;
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

  v_del_status := CASE
    WHEN v_sub.status = 'paused' THEN 'paused'::public.delivery_status_enum
    ELSE 'open'::public.delivery_status_enum
  END;

  -- Prefer delivery already scheduled in this Mon–Sun week (open or paused)
  SELECT d.*
  INTO v_del
  FROM public.deliveries d
  WHERE d.subscription_id = v_sub.id
    AND d.status IN ('open', 'paused')
    AND d.scheduled_date >= p_week_start
    AND d.scheduled_date <= p_week_end
  ORDER BY d.scheduled_date ASC, d.delivery_index ASC
  LIMIT 1;

  IF FOUND THEN
    IF v_del.status IS DISTINCT FROM v_del_status THEN
      UPDATE public.deliveries
      SET status = v_del_status
      WHERE id = v_del.id
      RETURNING * INTO v_del;
    END IF;
    RETURN v_del;
  END IF;

  -- Else next upcoming open/paused on/after this Monday
  SELECT d.*
  INTO v_del
  FROM public.deliveries d
  WHERE d.subscription_id = v_sub.id
    AND d.status IN ('open', 'paused')
    AND d.scheduled_date >= p_week_start
  ORDER BY d.scheduled_date ASC, d.delivery_index ASC
  LIMIT 1;

  IF FOUND THEN
    IF v_del.status IS DISTINCT FROM v_del_status THEN
      UPDATE public.deliveries
      SET status = v_del_status
      WHERE id = v_del.id
      RETURNING * INTO v_del;
    END IF;
    RETURN v_del;
  END IF;

  SELECT COALESCE(MAX(d.delivery_index), 0) + 1
  INTO v_next_index
  FROM public.deliveries d
  WHERE d.subscription_id = v_sub.id;

  SELECT d.weekly_budget
  INTO v_budget
  FROM public.deliveries d
  WHERE d.subscription_id = v_sub.id
  ORDER BY d.delivery_index DESC
  LIMIT 1;

  IF v_budget IS NULL THEN
    v_budget := 0;
  END IF;

  INSERT INTO public.deliveries (
    subscription_id,
    delivery_index,
    scheduled_date,
    status,
    weekly_budget,
    customizations
  )
  VALUES (
    v_sub.id,
    v_next_index,
    p_week_end,
    v_del_status,
    v_budget,
    '{}'::jsonb
  )
  RETURNING * INTO v_del;

  IF v_sub.status = 'active' THEN
    UPDATE public.subscriptions
    SET next_delivery_date = p_week_end,
        updated_at = timezone('utc'::text, now())
    WHERE id = v_sub.id
      AND (next_delivery_date IS NULL OR next_delivery_date < p_week_start);
  END IF;

  RETURN v_del;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_my_open_delivery_for_week(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_my_open_delivery_for_week(date, date) TO authenticated;

-- Stale cleanup: also cancel leftover paused rows before this Monday
CREATE OR REPLACE FUNCTION public.cancel_my_stale_open_deliveries(p_week_start date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n int := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_week_start IS NULL THEN
    RAISE EXCEPTION 'week_start is required';
  END IF;

  UPDATE public.deliveries d
  SET status = 'cancelled'
  FROM public.subscriptions s
  WHERE d.subscription_id = s.id
    AND s.user_id = auth.uid()
    AND s.status IN ('active', 'paused')
    AND d.status IN ('open', 'paused')
    AND d.scheduled_date < p_week_start;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

NOTIFY pgrst, 'reload schema';
