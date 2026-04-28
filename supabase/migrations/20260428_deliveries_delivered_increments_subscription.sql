-- When a delivery is marked delivered (manually by admin), increment subscription.deliveries_used
-- and update subscription.next_delivery_date to the next open delivery.
-- Removes reliance on "scheduled_date < today" auto-advance logic in the app.

CREATE OR REPLACE FUNCTION public.on_delivery_status_change_update_subscription()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_date date;
BEGIN
  -- Only act when status actually changes
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  -- If transitioning TO delivered, increment used counter and stamp delivered_at if missing.
  IF NEW.status = 'delivered' AND OLD.status IS DISTINCT FROM 'delivered' THEN
    IF NEW.delivered_at IS NULL THEN
      NEW.delivered_at := timezone('utc'::text, now());
    END IF;

    UPDATE public.subscriptions
    SET deliveries_used = COALESCE(deliveries_used, 0) + 1,
        updated_at = timezone('utc'::text, now())
    WHERE id = NEW.subscription_id;
  END IF;

  -- If transitioning AWAY from delivered, decrement used counter (undo).
  IF OLD.status = 'delivered' AND NEW.status IS DISTINCT FROM 'delivered' THEN
    UPDATE public.subscriptions
    SET deliveries_used = GREATEST(COALESCE(deliveries_used, 0) - 1, 0),
        updated_at = timezone('utc'::text, now())
    WHERE id = NEW.subscription_id;

    -- If admin un-delivers a row, clear delivered_at unless they explicitly keep it.
    IF NEW.delivered_at IS NOT NULL THEN
      NEW.delivered_at := NULL;
    END IF;
  END IF;

  -- Recompute next_delivery_date whenever status changes.
  SELECT d.scheduled_date
  INTO next_date
  FROM public.deliveries d
  WHERE d.subscription_id = NEW.subscription_id
    AND d.status = 'open'
  ORDER BY d.scheduled_date ASC, d.delivery_index ASC
  LIMIT 1;

  UPDATE public.subscriptions
  SET next_delivery_date = next_date,
      next_delivery = next_date,
      updated_at = timezone('utc'::text, now())
  WHERE id = NEW.subscription_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_delivery_status_change_update_subscription ON public.deliveries;
CREATE TRIGGER trg_delivery_status_change_update_subscription
BEFORE UPDATE OF status ON public.deliveries
FOR EACH ROW
EXECUTE FUNCTION public.on_delivery_status_change_update_subscription();

REVOKE ALL ON FUNCTION public.on_delivery_status_change_update_subscription() FROM PUBLIC;

COMMENT ON FUNCTION public.on_delivery_status_change_update_subscription() IS
  'On deliveries.status transition: adjust subscriptions.deliveries_used and recompute next_delivery_date (manual delivered status is source of truth).';

NOTIFY pgrst, 'reload schema';

