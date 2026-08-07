-- One-shot + ongoing: align current/next week deliveries with subscription pause state.
-- If subscription is paused → those deliveries must be paused (not left open).
-- Safe to re-run.

-- 1) Backfill: any open delivery in this ISO week or next week for a paused sub → paused
DO $$
DECLARE
  mon date := date_trunc('week', CURRENT_DATE)::date; -- Monday (ISO)
  sun date := mon + 6;
  nxt_mon date := mon + 7;
  nxt_sun date := mon + 13;
  n int;
BEGIN
  UPDATE public.deliveries d
  SET status = 'paused'
  FROM public.subscriptions s
  WHERE d.subscription_id = s.id
    AND s.status = 'paused'
    AND d.status = 'open'
    AND (
      (d.scheduled_date >= mon AND d.scheduled_date <= sun)
      OR (d.scheduled_date >= nxt_mon AND d.scheduled_date <= nxt_sun)
    );

  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'Backfill: set % open → paused for paused subscriptions (weeks % .. %)', n, mon, nxt_sun;
END $$;

-- 2) Ensure Admin weekly ensure creates/aligns paused correctly
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

-- 3) Make sure pause/resume RPC also forces existing open → paused (re-apply latest)
DROP FUNCTION IF EXISTS public.set_my_subscription_paused(boolean, date);

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
      SELECT COALESCE(MAX(d.delivery_index), 0) + 1
      INTO v_next_index
      FROM public.deliveries d
      WHERE d.subscription_id = v_sub.id;

      SELECT d.weekly_budget INTO v_budget
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

NOTIFY pgrst, 'reload schema';
