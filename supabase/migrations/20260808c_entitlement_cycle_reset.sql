-- Entitlement cycles for delivery_index / deliveries_used:
--   monthly prepaid (no COD/recurring) → 4
--   cash_on_delivery or recurring card → 12
--   one_time plan → 1
-- delivery_index is derived from subscriptions.deliveries_used (not independent).
-- When a cycle completes on deliver, reset deliveries_used to 0 so the next index starts at 1.

CREATE OR REPLACE FUNCTION public.effective_entitled_deliveries(p_subscription_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_code text;
  v_plan_entitled integer;
  v_pm_code text;
BEGIN
  SELECT sp.code, COALESCE(sp.entitled_deliveries, 4), pm.code
  INTO v_plan_code, v_plan_entitled, v_pm_code
  FROM public.subscriptions s
  LEFT JOIN public.subscription_plans sp ON sp.id = s.subscription_plan_id
  LEFT JOIN public.payment_methods pm ON pm.id = s.payment_method_id
  WHERE s.id = p_subscription_id;

  IF NOT FOUND THEN
    RETURN 4;
  END IF;

  -- One-time stays a single delivery
  IF v_plan_code = 'one_time' THEN
    RETURN GREATEST(COALESCE(v_plan_entitled, 1), 1);
  END IF;

  -- COD or card recurring → 12-delivery cycle
  IF v_pm_code IN ('cash_on_delivery', 'recurring') THEN
    RETURN 12;
  END IF;

  -- Monthly prepaid (and any other plan without those payment methods)
  RETURN GREATEST(COALESCE(v_plan_entitled, 4), 1);
END;
$$;

REVOKE ALL ON FUNCTION public.effective_entitled_deliveries(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.effective_entitled_deliveries(uuid) TO authenticated;

COMMENT ON FUNCTION public.effective_entitled_deliveries(uuid) IS
  'Cycle length: one_time=1; COD/recurring=12; else subscription_plans.entitled_deliveries (monthly=4).';

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

-- On delivered: bump deliveries_used + set delivery_index; reset used when cycle completes
CREATE OR REPLACE FUNCTION public.on_delivery_status_change_update_subscription()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_date date;
  v_used integer;
  v_entitled integer;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'delivered' AND OLD.status IS DISTINCT FROM 'delivered' THEN
    IF NEW.delivered_at IS NULL THEN
      NEW.delivered_at := timezone('utc'::text, now());
    END IF;

    v_entitled := public.effective_entitled_deliveries(NEW.subscription_id);

    UPDATE public.subscriptions
    SET deliveries_used = COALESCE(deliveries_used, 0) + 1,
        updated_at = timezone('utc'::text, now())
    WHERE id = NEW.subscription_id
    RETURNING deliveries_used INTO v_used;

    -- Index within current cycle (1..entitled)
    NEW.delivery_index := LEAST(COALESCE(v_used, 1), v_entitled);

    -- Cycle complete → reset so next open is #1 again
    IF COALESCE(v_used, 0) >= v_entitled THEN
      UPDATE public.subscriptions
      SET deliveries_used = 0,
          updated_at = timezone('utc'::text, now())
      WHERE id = NEW.subscription_id;
    END IF;
  END IF;

  IF OLD.status = 'delivered' AND NEW.status IS DISTINCT FROM 'delivered' THEN
    -- Undo deliver: move used back one within cycle (best-effort)
    UPDATE public.subscriptions
    SET deliveries_used = CASE
          WHEN COALESCE(deliveries_used, 0) = 0 THEN
            GREATEST(public.effective_entitled_deliveries(NEW.subscription_id) - 1, 0)
          ELSE GREATEST(COALESCE(deliveries_used, 0) - 1, 0)
        END,
        updated_at = timezone('utc'::text, now())
    WHERE id = NEW.subscription_id;

    IF NEW.delivered_at IS NOT NULL THEN
      NEW.delivered_at := NULL;
    END IF;

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
  'On delivered: set delivery_index from deliveries_used; reset deliveries_used when entitled cycle completes (4 monthly prepaid / 12 COD|recurring).';

-- Admin ensure: use effective entitlement (COD/recurring keep getting weeks after cycle reset)
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
      COALESCE(s.deliveries_used, 0) AS deliveries_used
    FROM public.subscriptions s
    WHERE s.status IN ('active', 'paused')
  LOOP
    v_entitled := public.effective_entitled_deliveries(r.subscription_id);

    -- Mid-cycle gate: if used still at entitled before reset somehow, skip
    -- (reset on deliver normally clears this). one_time stays blocked after 1.
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

    IF EXISTS (
      SELECT 1 FROM pg_proc WHERE proname = 'ensure_delivery_row_for_sunday'
    ) THEN
      v_after := public.ensure_delivery_row_for_sunday(
        r.subscription_id, p_week_start, p_week_end, v_want
      );
    ELSE
      CONTINUE;
    END IF;

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

-- Clear stale "cycle full" counters so COD/recurring can continue (and monthly can start next cycle)
UPDATE public.subscriptions s
SET deliveries_used = 0,
    updated_at = timezone('utc'::text, now())
WHERE COALESCE(s.deliveries_used, 0) >= public.effective_entitled_deliveries(s.id)
  AND s.status IN ('active', 'paused');

-- Align open/paused provisional indexes to deliveries_used + 1
UPDATE public.deliveries d
SET delivery_index = public.next_delivery_index_for_subscription(d.subscription_id)
WHERE d.status IN ('open', 'paused');

NOTIFY pgrst, 'reload schema';
