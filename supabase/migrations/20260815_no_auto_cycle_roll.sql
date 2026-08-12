-- Stop auto-creating the next subscription when a cycle ends.
-- Monthly (4) / weekly (12) / one_time (1): on last delivered delivery → status=completed only.
-- Customer must check in again (new prices) and create a new subscription explicitly.

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
  v_user_id uuid;
  v_plan_id uuid;
  v_bucket_id uuid;
  v_pm_id uuid;
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
    RETURNING deliveries_used, user_id, subscription_plan_id, bucket_type_id, payment_method_id
    INTO v_used, v_user_id, v_plan_id, v_bucket_id, v_pm_id;

    NEW.delivery_index := LEAST(COALESCE(v_used, 1), v_entitled);

    -- Cycle finished → complete this subscription only (no auto next row)
    IF COALESCE(v_used, 0) >= v_entitled THEN
      UPDATE public.subscriptions
      SET status = 'completed'::public.subscription_status_enum,
          completed_at = timezone('utc'::text, now()),
          updated_at = timezone('utc'::text, now())
      WHERE id = NEW.subscription_id
        AND status IN ('active', 'paused');

      IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'record_subscription_event') THEN
        PERFORM public.record_subscription_event(
          NEW.subscription_id,
          v_user_id,
          'cycle_completed',
          jsonb_build_object(
            'previous_data', jsonb_build_object(
              'deliveries_used', v_used,
              'subscription_plan_id', v_plan_id,
              'bucket_type_id', v_bucket_id,
              'payment_method_id', v_pm_id
            ),
            'new_data', jsonb_build_object(
              'status', 'completed',
              'renewal', 'manual_customer_check_in'
            )
          ),
          'Entitlement cycle finished — renew requires customer approval',
          NEW.id,
          NULL,
          'system'
        );
      END IF;
    END IF;
  END IF;

  IF OLD.status = 'delivered' AND NEW.status IS DISTINCT FROM 'delivered' THEN
    UPDATE public.subscriptions
    SET deliveries_used = GREATEST(COALESCE(deliveries_used, 0) - 1, 0),
        updated_at = timezone('utc'::text, now())
    WHERE id = NEW.subscription_id
      AND status IN ('active', 'paused', 'completed');

    IF NEW.delivered_at IS NOT NULL THEN
      NEW.delivered_at := NULL;
    END IF;

    NEW.delivery_index := COALESCE(
      (SELECT s.deliveries_used FROM public.subscriptions s WHERE s.id = NEW.subscription_id),
      0
    ) + 1;
  END IF;

  SELECT d.scheduled_date
  INTO next_date
  FROM public.deliveries d
  WHERE d.subscription_id = NEW.subscription_id
    AND d.status = 'open'
    AND d.id IS DISTINCT FROM NEW.id
  ORDER BY d.scheduled_date ASC, d.delivery_index ASC NULLS LAST
  LIMIT 1;

  IF next_date IS NULL AND NEW.status = 'open' THEN
    next_date := NEW.scheduled_date;
  END IF;

  UPDATE public.subscriptions
  SET next_delivery_date = next_date,
      updated_at = timezone('utc'::text, now())
  WHERE id = NEW.subscription_id
    AND status IN ('active', 'paused');

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.on_delivery_status_change_update_subscription() IS
  'On delivered: bump used + index; when cycle completes, mark subscription completed only (no auto-roll). Customer must renew manually.';

-- Keep roll helper for optional admin/manual use, but it is no longer called from the deliver trigger.
COMMENT ON FUNCTION public.roll_subscription_to_next_cycle(uuid, uuid) IS
  'Optional helper to start next cycle. Not auto-called; renew is customer-driven via createSubscription.';

NOTIFY pgrst, 'reload schema';
