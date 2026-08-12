-- Weekly / one_time billing list price = pack ÷ monthly entitlement (not full monthly_price).
-- Aligns SQL compute_subscription_charge with app getPlanBillingListPrice.

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
  v_pack numeric;
  v_list numeric;
  v_handling numeric;
  v_pack_weeks numeric := 4;
  v_plan_code text;
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
  INTO v_pack, v_handling
  FROM public.bucket_types bt
  WHERE bt.id = p_bucket_type_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bucket type not found';
  END IF;

  SELECT GREATEST(COALESCE(sp.entitled_deliveries, 4), 1)
  INTO v_pack_weeks
  FROM public.subscription_plans sp
  WHERE sp.code = 'monthly' AND sp.is_active = true
  ORDER BY sp.sort_order NULLS LAST
  LIMIT 1;

  v_pack_weeks := GREATEST(COALESCE(v_pack_weeks, 4), 1);
  v_list := v_pack;

  IF p_subscription_plan_id IS NOT NULL THEN
    SELECT sp.code,
           COALESCE(sp.prepaid_discount_pct, 0),
           COALESCE(sp.prepaid_discount_fixed, 0)
    INTO v_plan_code, v_plan_pct, v_plan_fixed
    FROM public.subscription_plans sp
    WHERE sp.id = p_subscription_plan_id AND sp.is_active = true;

    -- Monthly: charge the full pack. Weekly / one_time: one week unit.
    IF v_plan_code IS NOT NULL AND v_plan_code <> 'monthly' THEN
      v_list := ROUND(v_pack / v_pack_weeks, 2);
    END IF;
  END IF;

  IF p_payment_method_id IS NOT NULL THEN
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

-- Refresh snapshots for active/paused weekly & one_time subs that stored the full pack.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT s.id
    FROM public.subscriptions s
    JOIN public.subscription_plans sp ON sp.id = s.subscription_plan_id
    WHERE s.status IN ('active', 'paused')
      AND sp.code IN ('weekly', 'one_time')
  LOOP
    PERFORM public.apply_subscription_charge_snapshot(r.id);
  END LOOP;
END $$;
