-- Un-skip this week's delivery (skipped → open) for the logged-in active subscriber.

CREATE OR REPLACE FUNCTION public.unskip_my_delivery_this_week(
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

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No skipped delivery to resume for this week';
  END IF;

  UPDATE public.deliveries
  SET status = 'open'
  WHERE id = v_del.id
  RETURNING * INTO v_del;

  UPDATE public.subscriptions
  SET next_delivery_date = v_del.scheduled_date,
      updated_at = timezone('utc'::text, now())
  WHERE id = v_sub.id;

  RETURN json_build_object(
    'delivery_id', v_del.id,
    'scheduled_date', v_del.scheduled_date,
    'status', v_del.status::text
  );
END;
$$;

REVOKE ALL ON FUNCTION public.unskip_my_delivery_this_week(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unskip_my_delivery_this_week(date, date) TO authenticated;

COMMENT ON FUNCTION public.unskip_my_delivery_this_week(date, date) IS
  'Sets the caller’s skipped delivery in the given Mon–Sun week back to open.';

-- When ensuring a week, treat skipped as already present (do not create a second open row)
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

  -- Already skipped this week → return that row (do not create open)
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

-- Admin ensure: do not create a new open row if this week is already skipped
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

    -- Already skipped this week — leave it alone
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

NOTIFY pgrst, 'reload schema';
