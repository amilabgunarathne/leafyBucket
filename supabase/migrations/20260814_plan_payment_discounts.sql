-- Plan × payment flow matrix:
-- 1) Payment methods: Cash + Card (migrate from cash_on_delivery / recurring)
-- 2) Plan owns entitlement (stop COD/recurring → 12 override)
-- 3) Per-plan payment allow-list
-- 4) Discounts on plan + payment method; snapshot charge on subscriptions

-- =============================================================================
-- 1. Payment methods → cash / card (+ discount columns)
-- =============================================================================
ALTER TABLE public.payment_methods
  ADD COLUMN IF NOT EXISTS discount_pct NUMERIC(8, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.payment_methods
  ADD COLUMN IF NOT EXISTS discount_fixed NUMERIC(12, 2) NOT NULL DEFAULT 0;

-- Add checks only if missing (ignore failures on re-run)
DO $$
BEGIN
  ALTER TABLE public.payment_methods
    ADD CONSTRAINT payment_methods_discount_pct_check
    CHECK (discount_pct >= 0 AND discount_pct <= 100);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.payment_methods
    ADD CONSTRAINT payment_methods_discount_fixed_check
    CHECK (discount_fixed >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

UPDATE public.payment_methods
SET
  code = 'cash',
  name = 'Cash',
  description = 'Pay in cash when you receive your vegetables',
  updated_at = timezone('utc'::text, now())
WHERE code = 'cash_on_delivery';

UPDATE public.payment_methods
SET
  code = 'card',
  name = 'Card',
  description = 'Pay by card (charged per your plan)',
  updated_at = timezone('utc'::text, now())
WHERE code = 'recurring';

-- Insert cash/card if somehow missing
INSERT INTO public.payment_methods (code, name, description, sort_order, is_enabled, discount_pct, discount_fixed)
VALUES
  ('cash', 'Cash', 'Pay in cash when you receive your vegetables', 1, true, 0, 0),
  ('card', 'Card', 'Pay by card (charged per your plan)', 2, true, 0, 0)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  is_enabled = true,
  updated_at = timezone('utc'::text, now());

-- Disable any leftover legacy codes
UPDATE public.payment_methods
SET is_enabled = false, updated_at = timezone('utc'::text, now())
WHERE code NOT IN ('cash', 'card');

-- =============================================================================
-- 2. Plan discounts (monthly prepaid default 10%)
-- =============================================================================
ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS prepaid_discount_pct NUMERIC(8, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS prepaid_discount_fixed NUMERIC(12, 2) NOT NULL DEFAULT 0;

UPDATE public.subscription_plans
SET
  entitled_deliveries = 12,
  description = '12 deliveries — renew every 12 weeks',
  prepaid_discount_pct = 0,
  updated_at = timezone('utc'::text, now())
WHERE code = 'weekly';

UPDATE public.subscription_plans
SET
  entitled_deliveries = 4,
  description = '4 deliveries billed as one pack (prepaid discount may apply)',
  prepaid_discount_pct = 10,
  updated_at = timezone('utc'::text, now())
WHERE code = 'monthly';

UPDATE public.subscription_plans
SET
  entitled_deliveries = 1,
  description = 'Single delivery',
  prepaid_discount_pct = 0,
  updated_at = timezone('utc'::text, now())
WHERE code = 'one_time';

-- =============================================================================
-- 3. Per-plan payment allow-list
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.subscription_plan_payment_methods (
  subscription_plan_id UUID NOT NULL REFERENCES public.subscription_plans(id) ON DELETE CASCADE,
  payment_method_id UUID NOT NULL REFERENCES public.payment_methods(id) ON DELETE CASCADE,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (subscription_plan_id, payment_method_id)
);

CREATE INDEX IF NOT EXISTS spp_methods_plan_enabled_idx
  ON public.subscription_plan_payment_methods (subscription_plan_id)
  WHERE is_enabled = true;

ALTER TABLE public.subscription_plan_payment_methods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read plan payment methods" ON public.subscription_plan_payment_methods;
CREATE POLICY "Anyone can read plan payment methods"
  ON public.subscription_plan_payment_methods
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins manage plan payment methods" ON public.subscription_plan_payment_methods;
CREATE POLICY "Admins manage plan payment methods"
  ON public.subscription_plan_payment_methods
  FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

COMMENT ON TABLE public.subscription_plan_payment_methods IS
  'Which payment methods are allowed for each subscription plan (enable/disable per plan).';

-- Seed: all active plans × cash/card enabled
INSERT INTO public.subscription_plan_payment_methods (
  subscription_plan_id, payment_method_id, is_enabled, sort_order
)
SELECT sp.id, pm.id, true,
  CASE pm.code WHEN 'cash' THEN 1 WHEN 'card' THEN 2 ELSE 9 END
FROM public.subscription_plans sp
CROSS JOIN public.payment_methods pm
WHERE sp.is_active = true
  AND pm.code IN ('cash', 'card')
ON CONFLICT (subscription_plan_id, payment_method_id) DO NOTHING;

-- =============================================================================
-- 4. Charge snapshot on subscriptions
-- =============================================================================
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS list_price NUMERIC(12, 2);

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS discount_total NUMERIC(12, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS charge_amount NUMERIC(12, 2);

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS discount_breakdown JSONB;

COMMENT ON COLUMN public.subscriptions.list_price IS 'Bucket list price at signup/cycle start.';
COMMENT ON COLUMN public.subscriptions.discount_total IS 'Total discount applied (plan + payment), snapshotted.';
COMMENT ON COLUMN public.subscriptions.charge_amount IS 'Amount due for this cycle after discounts.';
COMMENT ON COLUMN public.subscriptions.discount_breakdown IS
  'JSON breakdown e.g. { plan_pct, plan_fixed, payment_pct, payment_fixed, lines: [...] }.';

-- =============================================================================
-- 5. Entitlement = plan only
-- =============================================================================
CREATE OR REPLACE FUNCTION public.effective_entitled_deliveries(p_subscription_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_entitled integer;
BEGIN
  SELECT COALESCE(sp.entitled_deliveries, 4)
  INTO v_plan_entitled
  FROM public.subscriptions s
  LEFT JOIN public.subscription_plans sp ON sp.id = s.subscription_plan_id
  WHERE s.id = p_subscription_id;

  IF NOT FOUND THEN
    RETURN 4;
  END IF;

  RETURN GREATEST(COALESCE(v_plan_entitled, 4), 1);
END;
$$;

COMMENT ON FUNCTION public.effective_entitled_deliveries(uuid) IS
  'Cycle length from subscription_plans.entitled_deliveries only (weekly=12, monthly=4, one_time=1).';

-- =============================================================================
-- 6. Compute charge (plan + payment discounts stack: plan first, then payment)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.compute_subscription_charge(
  p_bucket_type_id uuid,
  p_subscription_plan_id uuid,
  p_payment_method_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_list numeric;
  v_handling numeric;
  v_plan_pct numeric := 0;
  v_plan_fixed numeric := 0;
  v_pay_pct numeric := 0;
  v_pay_fixed numeric := 0;
  v_after_plan numeric;
  v_plan_disc numeric := 0;
  v_pay_disc numeric := 0;
  v_total_disc numeric;
  v_charge numeric;
  v_allowed boolean := false;
BEGIN
  SELECT COALESCE(bt.monthly_price, 0), COALESCE(bt.handling_fee, 0)
  INTO v_list, v_handling
  FROM public.bucket_types bt
  WHERE bt.id = p_bucket_type_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bucket type not found';
  END IF;

  IF p_subscription_plan_id IS NOT NULL THEN
    SELECT COALESCE(sp.prepaid_discount_pct, 0), COALESCE(sp.prepaid_discount_fixed, 0)
    INTO v_plan_pct, v_plan_fixed
    FROM public.subscription_plans sp
    WHERE sp.id = p_subscription_plan_id AND sp.is_active = true;
  END IF;

  IF p_payment_method_id IS NOT NULL THEN
    -- Must be allowed for this plan (when plan set)
    IF p_subscription_plan_id IS NOT NULL THEN
      SELECT spp.is_enabled INTO v_allowed
      FROM public.subscription_plan_payment_methods spp
      WHERE spp.subscription_plan_id = p_subscription_plan_id
        AND spp.payment_method_id = p_payment_method_id;

      IF NOT COALESCE(v_allowed, false) THEN
        RAISE EXCEPTION 'Payment method not allowed for this plan';
      END IF;
    END IF;

    SELECT COALESCE(pm.discount_pct, 0), COALESCE(pm.discount_fixed, 0)
    INTO v_pay_pct, v_pay_fixed
    FROM public.payment_methods pm
    WHERE pm.id = p_payment_method_id AND pm.is_enabled = true;
  END IF;

  v_plan_disc := ROUND(v_list * (v_plan_pct / 100.0), 2) + v_plan_fixed;
  IF v_plan_disc > v_list THEN
    v_plan_disc := v_list;
  END IF;
  v_after_plan := v_list - v_plan_disc;

  v_pay_disc := ROUND(v_after_plan * (v_pay_pct / 100.0), 2) + v_pay_fixed;
  IF v_pay_disc > v_after_plan THEN
    v_pay_disc := v_after_plan;
  END IF;

  v_total_disc := v_plan_disc + v_pay_disc;
  v_charge := GREATEST(v_list - v_total_disc, 0);

  RETURN jsonb_build_object(
    'list_price', v_list,
    'handling_fee', v_handling,
    'plan_discount_pct', v_plan_pct,
    'plan_discount_fixed', v_plan_fixed,
    'plan_discount_amount', v_plan_disc,
    'payment_discount_pct', v_pay_pct,
    'payment_discount_fixed', v_pay_fixed,
    'payment_discount_amount', v_pay_disc,
    'discount_total', v_total_disc,
    'charge_amount', v_charge
  );
END;
$$;

REVOKE ALL ON FUNCTION public.compute_subscription_charge(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.compute_subscription_charge(uuid, uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.apply_subscription_charge_snapshot(p_subscription_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub public.subscriptions%ROWTYPE;
  v_charge jsonb;
BEGIN
  SELECT * INTO v_sub FROM public.subscriptions WHERE id = p_subscription_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Subscription not found';
  END IF;

  v_charge := public.compute_subscription_charge(
    v_sub.bucket_type_id,
    v_sub.subscription_plan_id,
    v_sub.payment_method_id
  );

  UPDATE public.subscriptions
  SET
    list_price = (v_charge->>'list_price')::numeric,
    discount_total = COALESCE((v_charge->>'discount_total')::numeric, 0),
    charge_amount = (v_charge->>'charge_amount')::numeric,
    discount_breakdown = v_charge,
    updated_at = timezone('utc'::text, now())
  WHERE id = p_subscription_id;

  RETURN v_charge;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_subscription_charge_snapshot(uuid) FROM PUBLIC;

-- Payment methods allowed for a plan
CREATE OR REPLACE FUNCTION public.get_payment_methods_for_plan(p_subscription_plan_id uuid)
RETURNS SETOF public.payment_methods
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pm.*
  FROM public.payment_methods pm
  INNER JOIN public.subscription_plan_payment_methods spp
    ON spp.payment_method_id = pm.id
   AND spp.subscription_plan_id = p_subscription_plan_id
   AND spp.is_enabled = true
  WHERE pm.is_enabled = true
  ORDER BY spp.sort_order ASC, pm.sort_order ASC, pm.name ASC;
$$;

REVOKE ALL ON FUNCTION public.get_payment_methods_for_plan(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_payment_methods_for_plan(uuid) TO authenticated;

-- =============================================================================
-- 7. Cycle roll: recompute charge snapshot on new row
-- =============================================================================
CREATE OR REPLACE FUNCTION public.roll_subscription_to_next_cycle(
  p_old_subscription_id uuid,
  p_completed_delivery_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old public.subscriptions%ROWTYPE;
  v_new_id uuid;
  v_entitled integer;
  v_budget numeric;
  v_bt RECORD;
  v_plan_code text;
  v_charge jsonb;
BEGIN
  SELECT * INTO v_old
  FROM public.subscriptions
  WHERE id = p_old_subscription_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Subscription not found';
  END IF;

  IF v_old.status IS DISTINCT FROM 'active' AND v_old.status IS DISTINCT FROM 'paused' THEN
    SELECT id INTO v_new_id
    FROM public.subscriptions
    WHERE previous_subscription_id = p_old_subscription_id
    ORDER BY created_at DESC NULLS LAST
    LIMIT 1;
    RETURN v_new_id;
  END IF;

  SELECT sp.code INTO v_plan_code
  FROM public.subscription_plans sp
  WHERE sp.id = v_old.subscription_plan_id;

  UPDATE public.subscriptions
  SET status = 'completed'::public.subscription_status_enum,
      completed_at = timezone('utc'::text, now()),
      updated_at = timezone('utc'::text, now())
  WHERE id = v_old.id;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'record_subscription_event') THEN
    PERFORM public.record_subscription_event(
      v_old.id,
      v_old.user_id,
      'cycle_completed',
      jsonb_build_object(
        'previous_data', jsonb_build_object(
          'status', v_old.status::text,
          'deliveries_used', v_old.deliveries_used,
          'bucket_type_id', v_old.bucket_type_id,
          'subscription_plan_id', v_old.subscription_plan_id
        ),
        'new_data', jsonb_build_object('status', 'completed')
      ),
      'Entitlement cycle finished',
      p_completed_delivery_id,
      NULL,
      'system'
    );
  END IF;

  IF v_plan_code = 'one_time' THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_bt FROM public.bucket_types WHERE id = v_old.bucket_type_id;

  v_entitled := public.effective_entitled_deliveries(v_old.id);
  IF v_entitled IS NULL OR v_entitled < 1 THEN
    v_entitled := 4;
  END IF;

  IF v_bt.id IS NOT NULL THEN
    v_budget := ROUND(
      ((COALESCE(v_bt.monthly_price, 0) - COALESCE(v_bt.handling_fee, 0))::numeric) / v_entitled,
      2
    );
  ELSE
    v_budget := 0;
  END IF;

  v_charge := public.compute_subscription_charge(
    v_old.bucket_type_id,
    v_old.subscription_plan_id,
    v_old.payment_method_id
  );

  INSERT INTO public.subscriptions (
    user_id,
    bucket_type_id,
    subscription_plan_id,
    payment_method_id,
    status,
    deliveries_used,
    started_at,
    next_delivery_date,
    previous_subscription_id,
    list_price,
    discount_total,
    charge_amount,
    discount_breakdown
  ) VALUES (
    v_old.user_id,
    v_old.bucket_type_id,
    v_old.subscription_plan_id,
    v_old.payment_method_id,
    'active'::public.subscription_status_enum,
    0,
    timezone('utc'::text, now()),
    v_old.next_delivery_date,
    v_old.id,
    (v_charge->>'list_price')::numeric,
    COALESCE((v_charge->>'discount_total')::numeric, 0),
    (v_charge->>'charge_amount')::numeric,
    v_charge
  )
  RETURNING id INTO v_new_id;

  UPDATE public.deliveries d
  SET subscription_id = v_new_id,
      delivery_index = NULL,
      weekly_budget = COALESCE(v_budget, d.weekly_budget)
  WHERE d.subscription_id = v_old.id
    AND d.status IN ('open', 'paused')
    AND (p_completed_delivery_id IS NULL OR d.id IS DISTINCT FROM p_completed_delivery_id);

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'sync_open_delivery_indexes') THEN
    PERFORM public.sync_open_delivery_indexes(v_new_id);
  END IF;

  UPDATE public.subscriptions
  SET next_delivery_date = (
        SELECT MIN(d.scheduled_date)
        FROM public.deliveries d
        WHERE d.subscription_id = v_new_id AND d.status = 'open'
      ),
      updated_at = timezone('utc'::text, now())
  WHERE id = v_new_id;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'record_subscription_event') THEN
    PERFORM public.record_subscription_event(
      v_new_id,
      v_old.user_id,
      'created',
      jsonb_build_object(
        'previous_data', jsonb_build_object('previous_subscription_id', v_old.id),
        'new_data', jsonb_build_object(
          'status', 'active',
          'bucket_type_id', v_old.bucket_type_id,
          'subscription_plan_id', v_old.subscription_plan_id,
          'payment_method_id', v_old.payment_method_id,
          'charge', v_charge
        )
      ),
      'Auto-started next entitlement cycle',
      NULL,
      NULL,
      'system'
    );
  END IF;

  RETURN v_new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.roll_subscription_to_next_cycle(uuid, uuid) FROM PUBLIC;

NOTIFY pgrst, 'reload schema';
