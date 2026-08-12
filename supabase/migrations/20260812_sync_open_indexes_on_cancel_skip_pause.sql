-- Provisional delivery_index for open/paused:
--   deliveries_used+1, +2, … by scheduled_date (capped at entitled).
-- Sync whenever status changes — including cancel / skip / pause / unskip / resume /
-- deliver / undo-deliver — so remaining open/paused rows renumber.
--
-- Example: used=3, this week open=4, next week open=5.
-- Cancel this week → next week becomes 4.

CREATE OR REPLACE FUNCTION public.sync_open_delivery_indexes(p_subscription_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_used integer;
  v_entitled integer;
BEGIN
  IF p_subscription_id IS NULL THEN
    RETURN;
  END IF;

  SELECT COALESCE(s.deliveries_used, 0)
  INTO v_used
  FROM public.subscriptions s
  WHERE s.id = p_subscription_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_entitled := public.effective_entitled_deliveries(p_subscription_id);
  IF v_entitled IS NULL OR v_entitled < 1 THEN
    v_entitled := 12;
  END IF;

  -- Only open + paused take provisional slots (cancelled/skipped/delivered do not)
  WITH ordered AS (
    SELECT
      d.id,
      LEAST(
        v_used + ROW_NUMBER() OVER (ORDER BY d.scheduled_date ASC, d.id ASC),
        v_entitled
      ) AS new_index
    FROM public.deliveries d
    WHERE d.subscription_id = p_subscription_id
      AND d.status IN ('open', 'paused')
  )
  UPDATE public.deliveries d
  SET delivery_index = o.new_index
  FROM ordered o
  WHERE d.id = o.id
    AND d.delivery_index IS DISTINCT FROM o.new_index;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_open_delivery_indexes(uuid) FROM PUBLIC;

COMMENT ON FUNCTION public.sync_open_delivery_indexes(uuid) IS
  'Renumber open/paused delivery_index to used+1, used+2, … by scheduled_date (capped). Cancelled/skipped excluded.';

CREATE OR REPLACE FUNCTION public.after_delivery_status_sync_open_indexes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_successor uuid;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  -- Any status change can alter the open/paused queue (cancel, skip, pause, deliver, …)
  PERFORM public.sync_open_delivery_indexes(NEW.subscription_id);

  -- If cycle rolled on deliver, also sync successor
  IF NEW.status = 'delivered' AND OLD.status IS DISTINCT FROM 'delivered' THEN
    SELECT s.id
    INTO v_successor
    FROM public.subscriptions s
    WHERE s.previous_subscription_id = NEW.subscription_id
    ORDER BY s.created_at DESC NULLS LAST
    LIMIT 1;

    IF v_successor IS NOT NULL THEN
      PERFORM public.sync_open_delivery_indexes(v_successor);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.after_delivery_status_sync_open_indexes() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_delivery_status_sync_open_indexes ON public.deliveries;
CREATE TRIGGER trg_delivery_status_sync_open_indexes
  AFTER UPDATE OF status ON public.deliveries
  FOR EACH ROW
  EXECUTE FUNCTION public.after_delivery_status_sync_open_indexes();

-- Also sync when a new open/paused row is inserted (ensure week)
CREATE OR REPLACE FUNCTION public.after_delivery_insert_sync_open_indexes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('open', 'paused') THEN
    PERFORM public.sync_open_delivery_indexes(NEW.subscription_id);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.after_delivery_insert_sync_open_indexes() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_delivery_insert_sync_open_indexes ON public.deliveries;
CREATE TRIGGER trg_delivery_insert_sync_open_indexes
  AFTER INSERT ON public.deliveries
  FOR EACH ROW
  EXECUTE FUNCTION public.after_delivery_insert_sync_open_indexes();

-- Backfill
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT d.subscription_id
    FROM public.deliveries d
    WHERE d.status IN ('open', 'paused')
  LOOP
    PERFORM public.sync_open_delivery_indexes(r.subscription_id);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
