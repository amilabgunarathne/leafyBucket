-- Fix trigger: subscriptions has next_delivery_date only (no next_delivery column).
-- Also recompute next open delivery correctly when the row being updated leaves 'open'.

CREATE OR REPLACE FUNCTION public.on_delivery_status_change_update_subscription()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_date date;
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
    WHERE id = NEW.subscription_id;
  END IF;

  IF OLD.status = 'delivered' AND NEW.status IS DISTINCT FROM 'delivered' THEN
    UPDATE public.subscriptions
    SET deliveries_used = GREATEST(COALESCE(deliveries_used, 0) - 1, 0),
        updated_at = timezone('utc'::text, now())
    WHERE id = NEW.subscription_id;

    IF NEW.delivered_at IS NOT NULL THEN
      NEW.delivered_at := NULL;
    END IF;
  END IF;

  -- Next open delivery: treat this row as NEW.status (BEFORE UPDATE has not rewritten the table yet).
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
  'On deliveries.status transition: adjust deliveries_used and set next_delivery_date only (no legacy next_delivery column).';

NOTIFY pgrst, 'reload schema';
