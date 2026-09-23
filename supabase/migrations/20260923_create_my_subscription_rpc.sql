-- Fix: starting a bucket fails with
--   new row violates row-level security policy for table "subscriptions"
-- when the authenticated client INSERT is blocked (missing policy/grants on some envs).
-- Solution: SECURITY DEFINER create_my_subscription + re-assert subscriber RLS + grants.

-- -----------------------------------------------------------------------------
-- 1. Re-assert subscriber RLS + table grants
-- -----------------------------------------------------------------------------
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own subscriptions" ON public.subscriptions;
CREATE POLICY "Users can view own subscriptions"
  ON public.subscriptions
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own subscriptions" ON public.subscriptions;
CREATE POLICY "Users can insert own subscriptions"
  ON public.subscriptions
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own subscriptions" ON public.subscriptions;
CREATE POLICY "Users can update own subscriptions"
  ON public.subscriptions
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE ON public.subscriptions TO authenticated;

-- -----------------------------------------------------------------------------
-- 2. create_my_subscription — authenticated caller only; always uses auth.uid()
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_my_subscription(
  p_bucket_type_id uuid,
  p_plan_code text,
  p_payment_method_id uuid DEFAULT NULL
)
RETURNS public.subscriptions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_plan public.subscription_plans%ROWTYPE;
  v_bucket public.bucket_types%ROWTYPE;
  v_charge jsonb;
  v_old public.subscriptions%ROWTYPE;
  v_sub public.subscriptions%ROWTYPE;
  v_week_start date;
  v_week_end date;
  v_budget numeric;
  v_pack_weeks integer := 4;
BEGIN
  IF v_uid IS NULL THEN
    -- Fallback if auth.uid() is unset but JWT sub claim is present
    BEGIN
      v_uid := NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
    EXCEPTION
      WHEN OTHERS THEN
        v_uid := NULL;
    END;
  END IF;

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated. Please sign in again and retry.';
  END IF;

  IF p_bucket_type_id IS NULL THEN
    RAISE EXCEPTION 'Bucket type is required';
  END IF;

  IF p_plan_code IS NULL OR p_plan_code NOT IN ('weekly', 'monthly', 'one_time') THEN
    RAISE EXCEPTION 'Invalid billing plan';
  END IF;

  SELECT * INTO v_bucket
  FROM public.bucket_types bt
  WHERE bt.id = p_bucket_type_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bucket type not found';
  END IF;

  SELECT * INTO v_plan
  FROM public.subscription_plans sp
  WHERE sp.code = p_plan_code
    AND sp.is_active = true
  ORDER BY sp.sort_order NULLS LAST
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Subscription plan not found: %', p_plan_code;
  END IF;

  -- Charge snapshot (also validates payment method is allowed for this plan)
  v_charge := public.compute_subscription_charge(
    p_bucket_type_id,
    v_plan.id,
    p_payment_method_id
  );

  -- Cancel existing active rows for this user (history preserved)
  FOR v_old IN
    SELECT *
    FROM public.subscriptions s
    WHERE s.user_id = v_uid
      AND s.status = 'active'
  LOOP
    UPDATE public.subscriptions
    SET status = 'cancelled'
    WHERE id = v_old.id;

    PERFORM public.record_subscription_event(
      v_old.id,
      v_uid,
      'cancelled',
      jsonb_build_object(
        'previous_data', jsonb_build_object(
          'status', 'active',
          'bucket_type_id', v_old.bucket_type_id,
          'subscription_plan_id', v_old.subscription_plan_id
        ),
        'new_data', jsonb_build_object('status', 'cancelled')
      ),
      'Replaced by a new subscription',
      NULL,
      v_uid,
      'subscriber'
    );
  END LOOP;

  INSERT INTO public.subscriptions (
    user_id,
    bucket_type_id,
    subscription_plan_id,
    payment_method_id,
    status,
    started_at,
    list_price,
    discount_total,
    charge_amount,
    discount_breakdown
  )
  VALUES (
    v_uid,
    p_bucket_type_id,
    v_plan.id,
    p_payment_method_id,
    'active',
    timezone('utc'::text, now()),
    COALESCE((v_charge->>'list_price')::numeric, 0),
    COALESCE((v_charge->>'discount_total')::numeric, 0),
    COALESCE((v_charge->>'charge_amount')::numeric, 0),
    v_charge
  )
  RETURNING * INTO v_sub;

  PERFORM public.record_subscription_event(
    v_sub.id,
    v_uid,
    'created',
    jsonb_build_object(
      'previous_data', NULL,
      'new_data', jsonb_build_object(
        'status', 'active',
        'bucket_type_id', p_bucket_type_id,
        'bucket_type_name', v_bucket.name,
        'subscription_plan_id', v_plan.id,
        'plan_code', v_plan.code,
        'payment_method_id', p_payment_method_id,
        'charge', v_charge
      )
    ),
    NULL,
    NULL,
    v_uid,
    'subscriber'
  );

  -- First open delivery for current market week
  SELECT GREATEST(COALESCE(sp.entitled_deliveries, 4), 1)
  INTO v_pack_weeks
  FROM public.subscription_plans sp
  WHERE sp.code = 'monthly' AND sp.is_active = true
  ORDER BY sp.sort_order NULLS LAST
  LIMIT 1;
  v_pack_weeks := GREATEST(COALESCE(v_pack_weeks, 4), 1);

  -- Monday-start week in Asia/Colombo (matches app getCurrentWeekDateRange)
  v_week_start := (
    date_trunc('week', (timezone('Asia/Colombo', now()))::timestamp)
  )::date;
  v_week_end := v_week_start + 6;

  v_budget := GREATEST(
    ((COALESCE(v_bucket.monthly_price, 0) - COALESCE(v_bucket.handling_fee, 0))::numeric) / v_pack_weeks::numeric,
    0
  );

  BEGIN
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
      NULL,
      v_week_end,
      'open',
      v_budget,
      '{}'::jsonb
    );
  EXCEPTION
    WHEN unique_violation THEN
      NULL; -- already have an open row for this Sunday
  END;

  UPDATE public.subscriptions
  SET next_delivery_date = v_week_end
  WHERE id = v_sub.id
  RETURNING * INTO v_sub;

  RETURN v_sub;
END;
$$;

COMMENT ON FUNCTION public.create_my_subscription(uuid, text, uuid) IS
  'Create an active subscription for the logged-in user (cancels prior active). SECURITY DEFINER so RLS cannot block signup.';

REVOKE ALL ON FUNCTION public.create_my_subscription(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_my_subscription(uuid, text, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
