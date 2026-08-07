-- Bulk: for each active subscription still within plan entitlement, ensure an open
-- delivery scheduled on this market week's Sunday (week_end).
-- Called when Admin creates/loads current (and next) market weeks.

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
      COALESCE(s.deliveries_used, 0) AS deliveries_used,
      COALESCE(sp.entitled_deliveries, 1) AS entitled_deliveries,
      bt.monthly_price,
      bt.handling_fee
    FROM public.subscriptions s
    LEFT JOIN public.subscription_plans sp ON sp.id = s.subscription_plan_id
    LEFT JOIN public.bucket_types bt ON bt.id = s.bucket_type_id
    WHERE s.status = 'active'
  LOOP
    v_entitled := GREATEST(r.entitled_deliveries, 1);
    -- Prepaid-style: stop creating once used up (renewal / new sub extends later)
    IF r.deliveries_used >= v_entitled THEN
      CONTINUE;
    END IF;

    -- Already have an open delivery in this market week?
    IF EXISTS (
      SELECT 1
      FROM public.deliveries d
      WHERE d.subscription_id = r.subscription_id
        AND d.status = 'open'
        AND d.scheduled_date >= p_week_start
        AND d.scheduled_date <= p_week_end
    ) THEN
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
      'open',
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
    WHERE id = r.subscription_id;

    n := n + 1;
  END LOOP;

  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_open_deliveries_for_market_week(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_open_deliveries_for_market_week(date, date) TO authenticated;

COMMENT ON FUNCTION public.ensure_open_deliveries_for_market_week(date, date) IS
  'Admin: for each active sub under plan entitlement, ensure one open delivery on market week Sunday.';

NOTIFY pgrst, 'reload schema';
