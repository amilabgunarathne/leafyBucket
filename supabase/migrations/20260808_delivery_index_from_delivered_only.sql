-- delivery_index must advance only when a delivery is marked delivered.
-- Previously: MAX(all rows)+1 on every insert (skip/ensure/pause also bumped it).
-- Now: new open/paused rows use subscriptions.deliveries_used + 1;
--       on status → delivered, set delivery_index = new deliveries_used.

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

REVOKE ALL ON FUNCTION public.next_delivery_index_for_subscription(uuid) FROM PUBLIC;

COMMENT ON FUNCTION public.next_delivery_index_for_subscription(uuid) IS
  'Next entitlement slot index = deliveries_used + 1 (does not count open/skipped/paused rows).';

-- Assign definitive index when marked delivered
CREATE OR REPLACE FUNCTION public.on_delivery_status_change_update_subscription()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_date date;
  v_used integer;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'delivered' AND OLD.status IS DISTINCT FROM 'delivered' THEN
    IF NEW.delivered_at IS NULL THEN
      NEW.delivered_at := timezone('utc'::text, now());
    END IF;

    UPDATE public.subscriptions
    SET deliveries_used = COALESCE(deliveries_used, 0) + 1,
        updated_at = timezone('utc'::text, now())
    WHERE id = NEW.subscription_id
    RETURNING deliveries_used INTO v_used;

    -- Index reflects delivered sequence only
    NEW.delivery_index := COALESCE(v_used, 1);
  END IF;

  IF OLD.status = 'delivered' AND NEW.status IS DISTINCT FROM 'delivered' THEN
    UPDATE public.subscriptions
    SET deliveries_used = GREATEST(COALESCE(deliveries_used, 0) - 1, 0),
        updated_at = timezone('utc'::text, now())
    WHERE id = NEW.subscription_id;

    IF NEW.delivered_at IS NOT NULL THEN
      NEW.delivered_at := NULL;
    END IF;

    -- Revert provisional index to current next slot
    NEW.delivery_index := public.next_delivery_index_for_subscription(NEW.subscription_id);
  END IF;

  SELECT x.scheduled_date
  INTO next_date
  FROM (
    SELECT d.scheduled_date, d.delivery_index
    FROM public.deliveries d
    WHERE d.subscription_id = NEW.subscription_id
      AND d.id IS DISTINCT FROM NEW.id
      AND d.status = 'open'
    UNION ALL
    SELECT NEW.scheduled_date, NEW.delivery_index
    WHERE NEW.status = 'open'
  ) x
  ORDER BY x.scheduled_date ASC, x.delivery_index ASC
  LIMIT 1;

  UPDATE public.subscriptions
  SET next_delivery_date = next_date,
      updated_at = timezone('utc'::text, now())
  WHERE id = NEW.subscription_id;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.on_delivery_status_change_update_subscription() IS
  'On delivered: increment deliveries_used and set delivery_index to that count. Recompute next_delivery_date.';

-- ---------------------------------------------------------------------------
-- ensure_my_open_delivery_for_week: index from deliveries_used only
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

  SELECT d.*
  INTO v_del
  FROM public.deliveries d
  WHERE d.subscription_id = v_sub.id
    AND d.status = 'skipped'
    AND d.scheduled_date >= p_week_start
    AND d.scheduled_date <= p_week_end
  ORDER BY d.scheduled_date ASC, d.delivery_index ASC
  LIMIT 1;

  IF FOUND THEN
    RETURN v_del;
  END IF;

  v_del_status := CASE
    WHEN v_sub.status = 'paused' THEN 'paused'::public.delivery_status_enum
    ELSE 'open'::public.delivery_status_enum
  END;

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

  v_next_index := public.next_delivery_index_for_subscription(v_sub.id);

  SELECT d.weekly_budget
  INTO v_budget
  FROM public.deliveries d
  WHERE d.subscription_id = v_sub.id
  ORDER BY d.scheduled_date DESC, d.delivery_index DESC
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

-- ---------------------------------------------------------------------------
-- Admin ensure: same index rule
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
  v_want public.delivery_status_enum;
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

    IF EXISTS (
      SELECT 1 FROM public.deliveries d
      WHERE d.subscription_id = r.subscription_id
        AND d.status = 'skipped'
        AND d.scheduled_date >= p_week_start
        AND d.scheduled_date <= p_week_end
    ) THEN
      CONTINUE;
    END IF;

    v_want := CASE
      WHEN r.subscription_status = 'paused' THEN 'paused'::public.delivery_status_enum
      ELSE 'open'::public.delivery_status_enum
    END;

    IF EXISTS (
      SELECT 1
      FROM public.deliveries d
      WHERE d.subscription_id = r.subscription_id
        AND d.status IN ('open', 'paused')
        AND d.scheduled_date >= p_week_start
        AND d.scheduled_date <= p_week_end
    ) THEN
      UPDATE public.deliveries d
      SET status = v_want
      WHERE d.subscription_id = r.subscription_id
        AND d.status IN ('open', 'paused')
        AND d.scheduled_date >= p_week_start
        AND d.scheduled_date <= p_week_end
        AND d.status IS DISTINCT FROM v_want;
      CONTINUE;
    END IF;

    v_next_index := r.deliveries_used + 1;

    SELECT d.weekly_budget INTO v_budget
    FROM public.deliveries d
    WHERE d.subscription_id = r.subscription_id
    ORDER BY d.scheduled_date DESC, d.delivery_index DESC
    LIMIT 1;

    IF v_budget IS NULL THEN
      v_budget := ROUND(
        ((COALESCE(r.monthly_price, 0) - COALESCE(r.handling_fee, 0))::numeric)
        / v_entitled,
        2
      );
    END IF;

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
      v_want,
      COALESCE(v_budget, 0),
      '{}'::jsonb
    );

    IF r.subscription_status = 'active' THEN
      UPDATE public.subscriptions
      SET next_delivery_date = CASE
            WHEN next_delivery_date IS NULL OR next_delivery_date < p_week_start
              THEN p_week_end
            ELSE next_delivery_date
          END,
          updated_at = timezone('utc'::text, now())
      WHERE id = r.subscription_id;
    END IF;

    n := n + 1;
  END LOOP;

  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_open_deliveries_for_market_week(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_open_deliveries_for_market_week(date, date) TO authenticated;

-- ---------------------------------------------------------------------------
-- Skip: next-week row uses deliveries_used + 1 (not MAX all rows)
-- ---------------------------------------------------------------------------
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
  v_next_index integer;
  v_budget numeric;
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
  ORDER BY d.scheduled_date ASC, d.delivery_index ASC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No open delivery to skip for this week';
  END IF;

  UPDATE public.deliveries
  SET status = 'skipped'
  WHERE id = v_del.id
  RETURNING * INTO v_del;

  SELECT d.*
  INTO v_next
  FROM public.deliveries d
  WHERE d.subscription_id = v_sub.id
    AND d.status IN ('open', 'paused')
    AND d.scheduled_date >= v_nxt_start
    AND d.scheduled_date <= v_nxt_end
  ORDER BY d.scheduled_date ASC, d.delivery_index ASC
  LIMIT 1;

  IF NOT FOUND THEN
    v_next_index := public.next_delivery_index_for_subscription(v_sub.id);

    SELECT d.weekly_budget INTO v_budget
    FROM public.deliveries d
    WHERE d.subscription_id = v_sub.id
    ORDER BY d.scheduled_date DESC, d.delivery_index DESC
    LIMIT 1;

    IF v_budget IS NULL THEN
      v_budget := COALESCE(v_del.weekly_budget, 0);
    END IF;

    INSERT INTO public.deliveries (
      subscription_id,
      delivery_index,
      scheduled_date,
      status,
      weekly_budget,
      customizations
    ) VALUES (
      v_sub.id,
      v_next_index,
      v_nxt_end,
      'open',
      v_budget,
      '{}'::jsonb
    )
    RETURNING * INTO v_next;
  ELSIF v_next.status = 'paused' THEN
    UPDATE public.deliveries
    SET status = 'open'
    WHERE id = v_next.id
    RETURNING * INTO v_next;
  END IF;

  UPDATE public.subscriptions
  SET next_delivery_date = v_next.scheduled_date,
      updated_at = timezone('utc'::text, now())
  WHERE id = v_sub.id;

  IF EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'record_subscription_event'
  ) THEN
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

-- Pause/resume inserts: use deliveries_used + 1
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
  v_next_index integer;
  v_budget numeric;
  v_updated int := 0;
  v_created int := 0;
  v_n int;
  v_prev_status text;
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
    IF EXISTS (
      SELECT 1
      FROM public.deliveries d
      WHERE d.subscription_id = v_sub.id
        AND d.status IN ('open', 'paused')
        AND d.scheduled_date >= v_week.week_start
        AND d.scheduled_date <= v_week.week_end
    ) THEN
      UPDATE public.deliveries d
      SET status = v_new_del_status
      WHERE d.subscription_id = v_sub.id
        AND d.status IN ('open', 'paused')
        AND d.scheduled_date >= v_week.week_start
        AND d.scheduled_date <= v_week.week_end;

      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_updated := v_updated + v_n;
    ELSE
      v_next_index := public.next_delivery_index_for_subscription(v_sub.id);

      SELECT d.weekly_budget INTO v_budget
      FROM public.deliveries d
      WHERE d.subscription_id = v_sub.id
      ORDER BY d.scheduled_date DESC, d.delivery_index DESC
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
      ) VALUES (
        v_sub.id,
        v_next_index,
        v_week.week_end,
        v_new_del_status,
        v_budget,
        '{}'::jsonb
      );

      v_created := v_created + 1;
    END IF;
  END LOOP;

  IF NOT p_paused THEN
    UPDATE public.subscriptions
    SET next_delivery_date = v_cur_end,
        updated_at = timezone('utc'::text, now())
    WHERE id = v_sub.id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'record_subscription_event'
  ) THEN
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

-- Optional backfill: set delivered rows' index by delivered order; open/paused to deliveries_used+1
DO $$
DECLARE
  r record;
  i int;
BEGIN
  FOR r IN SELECT id FROM public.subscriptions LOOP
    i := 0;
    UPDATE public.deliveries d
    SET delivery_index = s.rn
    FROM (
      SELECT id,
             ROW_NUMBER() OVER (
               ORDER BY COALESCE(delivered_at, timezone('utc'::text, now())), scheduled_date, id
             ) AS rn
      FROM public.deliveries
      WHERE subscription_id = r.id
        AND status = 'delivered'
    ) s
    WHERE d.id = s.id;

    SELECT COALESCE(deliveries_used, 0) INTO i
    FROM public.subscriptions WHERE id = r.id;

    -- Align deliveries_used to delivered count if lower
    UPDATE public.subscriptions s
    SET deliveries_used = GREATEST(
          COALESCE(s.deliveries_used, 0),
          (SELECT COUNT(*)::int FROM public.deliveries d WHERE d.subscription_id = s.id AND d.status = 'delivered')
        )
    WHERE s.id = r.id;

    SELECT COALESCE(deliveries_used, 0) INTO i
    FROM public.subscriptions WHERE id = r.id;

    UPDATE public.deliveries
    SET delivery_index = i + 1
    WHERE subscription_id = r.id
      AND status IN ('open', 'paused', 'skipped');
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
