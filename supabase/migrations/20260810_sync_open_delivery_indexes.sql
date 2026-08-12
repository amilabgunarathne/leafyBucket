-- Keep open/paused delivery_index in sync with subscriptions.deliveries_used.
-- Sequential provisional slots: used+1, used+2, … by scheduled_date (capped).
-- AFTER trigger syncs on deliver/undo; 20260812 extends sync to cancel/skip/pause + insert.

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
  'Renumber open/paused delivery_index to used+1, used+2, … by scheduled_date (capped at entitled).';

-- BEFORE: bump used + definitive index on delivered row + optional cycle roll
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
  v_new_sub uuid;
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

    NEW.delivery_index := LEAST(COALESCE(v_used, 1), v_entitled);

    IF COALESCE(v_used, 0) >= v_entitled THEN
      v_new_sub := public.roll_subscription_to_next_cycle(NEW.subscription_id, NEW.id);
    END IF;
  END IF;

  IF OLD.status = 'delivered' AND NEW.status IS DISTINCT FROM 'delivered' THEN
    UPDATE public.subscriptions
    SET deliveries_used = GREATEST(COALESCE(deliveries_used, 0) - 1, 0),
        updated_at = timezone('utc'::text, now())
    WHERE id = NEW.subscription_id
      AND status IN ('active', 'paused', 'completed')
    RETURNING deliveries_used INTO v_used;

    IF NEW.delivered_at IS NOT NULL THEN
      NEW.delivered_at := NULL;
    END IF;

    NEW.delivery_index := COALESCE(v_used, 0) + 1;
  END IF;

  SELECT d.scheduled_date
  INTO next_date
  FROM public.deliveries d
  WHERE d.subscription_id = NEW.subscription_id
    AND d.status = 'open'
    AND d.id IS DISTINCT FROM NEW.id
  ORDER BY d.scheduled_date ASC, d.delivery_index ASC
  LIMIT 1;

  IF next_date IS NULL AND NEW.status = 'open' THEN
    next_date := NEW.scheduled_date;
  END IF;

  UPDATE public.subscriptions
  SET next_delivery_date = next_date,
      updated_at = timezone('utc'::text, now())
  WHERE id = NEW.subscription_id
    AND status IN ('active', 'paused');

  IF v_new_sub IS NOT NULL THEN
    UPDATE public.subscriptions s
    SET next_delivery_date = (
          SELECT MIN(d.scheduled_date)
          FROM public.deliveries d
          WHERE d.subscription_id = s.id AND d.status = 'open'
        ),
        updated_at = timezone('utc'::text, now())
    WHERE s.id = v_new_sub;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.on_delivery_status_change_update_subscription() IS
  'On delivered: bump deliveries_used + set this row index; on cycle end roll to a new subscription. Open-index sync is in AFTER trigger.';

-- AFTER: rewrite sibling open/paused indexes (deliver/undo only here;
-- 20260812 expands to cancel/skip/pause)
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

  IF NOT (
    (NEW.status = 'delivered' AND OLD.status IS DISTINCT FROM 'delivered')
    OR (OLD.status = 'delivered' AND NEW.status IS DISTINCT FROM 'delivered')
  ) THEN
    RETURN NEW;
  END IF;

  PERFORM public.sync_open_delivery_indexes(NEW.subscription_id);

  SELECT s.id
  INTO v_successor
  FROM public.subscriptions s
  WHERE s.previous_subscription_id = NEW.subscription_id
  ORDER BY s.created_at DESC NULLS LAST
  LIMIT 1;

  IF v_successor IS NOT NULL THEN
    PERFORM public.sync_open_delivery_indexes(v_successor);
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
