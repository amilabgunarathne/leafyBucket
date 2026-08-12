-- Provisional delivery_index only for the current calendar week (Mon–Sun, Asia/Colombo).
-- Future open/paused weeks: delivery_index = NULL until that week becomes current
-- (Admin ensure / status change / insert triggers sync).
-- Delivered rows keep their definitive index (set by deliver trigger).

-- 1) Allow NULL provisional indexes on future weeks
ALTER TABLE public.deliveries
  ALTER COLUMN delivery_index DROP NOT NULL;

COMMENT ON COLUMN public.deliveries.delivery_index IS
  'Definitive on delivered; provisional only for current-week open/paused; NULL for future open/paused.';

-- 2) Week helpers (match app Mon–Sun, Sri Lanka local date)
CREATE OR REPLACE FUNCTION public.app_today()
RETURNS date
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT (timezone('Asia/Colombo', now()))::date;
$$;

CREATE OR REPLACE FUNCTION public.calendar_week_start(p_day date DEFAULT NULL)
RETURNS date
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT date_trunc('week', COALESCE(p_day, public.app_today())::timestamp)::date;
$$;

CREATE OR REPLACE FUNCTION public.calendar_week_end(p_day date DEFAULT NULL)
RETURNS date
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT (date_trunc('week', COALESCE(p_day, public.app_today())::timestamp)::date + 6);
$$;

REVOKE ALL ON FUNCTION public.app_today() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.calendar_week_start(date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.calendar_week_end(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_today() TO authenticated;
GRANT EXECUTE ON FUNCTION public.calendar_week_start(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calendar_week_end(date) TO authenticated;

-- 3) Sync: current week open/paused → used+1; other open/paused → NULL
CREATE OR REPLACE FUNCTION public.sync_open_delivery_indexes(p_subscription_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_used integer;
  v_entitled integer;
  v_next integer;
  v_week_start date;
  v_week_end date;
  v_current_id uuid;
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

  v_week_start := public.calendar_week_start();
  v_week_end := public.calendar_week_end();
  v_next := LEAST(v_used + 1, v_entitled);

  -- Future + past open/paused: clear provisional index (logs keep status/date)
  UPDATE public.deliveries d
  SET delivery_index = NULL
  WHERE d.subscription_id = p_subscription_id
    AND d.status IN ('open', 'paused')
    AND (d.scheduled_date < v_week_start OR d.scheduled_date > v_week_end)
    AND d.delivery_index IS NOT NULL;

  -- Current week: assign next slot to earliest open/paused Sunday row
  SELECT d.id
  INTO v_current_id
  FROM public.deliveries d
  WHERE d.subscription_id = p_subscription_id
    AND d.status IN ('open', 'paused')
    AND d.scheduled_date >= v_week_start
    AND d.scheduled_date <= v_week_end
  ORDER BY d.scheduled_date ASC, d.id ASC
  LIMIT 1;

  IF v_current_id IS NOT NULL THEN
    UPDATE public.deliveries d
    SET delivery_index = v_next
    WHERE d.id = v_current_id
      AND d.delivery_index IS DISTINCT FROM v_next;

    -- If multiple open/paused in current week, clear extras
    UPDATE public.deliveries d
    SET delivery_index = NULL
    WHERE d.subscription_id = p_subscription_id
      AND d.status IN ('open', 'paused')
      AND d.scheduled_date >= v_week_start
      AND d.scheduled_date <= v_week_end
      AND d.id IS DISTINCT FROM v_current_id
      AND d.delivery_index IS NOT NULL;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.sync_open_delivery_indexes(uuid) IS
  'Provisional delivery_index only on current-week open/paused (= used+1); future/past open/paused cleared to NULL.';

-- 4) AFTER status: always sync (cancel/skip/pause/deliver/…)
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

  PERFORM public.sync_open_delivery_indexes(NEW.subscription_id);

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

DROP TRIGGER IF EXISTS trg_delivery_status_sync_open_indexes ON public.deliveries;
CREATE TRIGGER trg_delivery_status_sync_open_indexes
  AFTER UPDATE OF status ON public.deliveries
  FOR EACH ROW
  EXECUTE FUNCTION public.after_delivery_status_sync_open_indexes();

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

DROP TRIGGER IF EXISTS trg_delivery_insert_sync_open_indexes ON public.deliveries;
CREATE TRIGGER trg_delivery_insert_sync_open_indexes
  AFTER INSERT ON public.deliveries
  FOR EACH ROW
  EXECUTE FUNCTION public.after_delivery_insert_sync_open_indexes();

-- 5) Ensure helper: insert with NULL index; sync assigns if week is current
CREATE OR REPLACE FUNCTION public.ensure_delivery_row_for_sunday(
  p_subscription_id uuid,
  p_week_start date,
  p_week_end date,
  p_status public.delivery_status_enum DEFAULT 'open'
)
RETURNS public.deliveries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_del public.deliveries%ROWTYPE;
  v_budget numeric;
BEGIN
  IF p_subscription_id IS NULL OR p_week_start IS NULL OR p_week_end IS NULL THEN
    RAISE EXCEPTION 'subscription_id, week_start, week_end required';
  END IF;

  IF p_status IS DISTINCT FROM 'open' AND p_status IS DISTINCT FROM 'paused' THEN
    RAISE EXCEPTION 'ensure_delivery_row_for_sunday only creates open or paused';
  END IF;

  SELECT d.*
  INTO v_del
  FROM public.deliveries d
  WHERE d.subscription_id = p_subscription_id
    AND d.scheduled_date >= p_week_start
    AND d.scheduled_date <= p_week_end
  ORDER BY
    CASE d.status::text
      WHEN 'open' THEN 1
      WHEN 'paused' THEN 2
      WHEN 'skipped' THEN 3
      WHEN 'locked' THEN 4
      WHEN 'delivered' THEN 5
      ELSE 6
    END ASC,
    d.id ASC
  LIMIT 1;

  IF FOUND THEN
    IF v_del.status IN ('delivered', 'locked', 'skipped') THEN
      RETURN v_del;
    END IF;
    IF v_del.status = 'cancelled' THEN
      UPDATE public.deliveries
      SET status = p_status,
          delivery_index = NULL
      WHERE id = v_del.id
      RETURNING * INTO v_del;
      PERFORM public.sync_open_delivery_indexes(p_subscription_id);
      SELECT * INTO v_del FROM public.deliveries WHERE id = v_del.id;
      RETURN v_del;
    END IF;
    IF v_del.status IS DISTINCT FROM p_status THEN
      UPDATE public.deliveries
      SET status = p_status
      WHERE id = v_del.id
      RETURNING * INTO v_del;
    END IF;
    PERFORM public.sync_open_delivery_indexes(p_subscription_id);
    SELECT * INTO v_del FROM public.deliveries WHERE id = v_del.id;
    RETURN v_del;
  END IF;

  SELECT d.weekly_budget INTO v_budget
  FROM public.deliveries d
  WHERE d.subscription_id = p_subscription_id
  ORDER BY d.scheduled_date DESC NULLS LAST, d.id DESC
  LIMIT 1;

  IF v_budget IS NULL THEN
    v_budget := 0;
  END IF;

  BEGIN
    INSERT INTO public.deliveries (
      subscription_id,
      delivery_index,
      scheduled_date,
      status,
      weekly_budget,
      customizations
    ) VALUES (
      p_subscription_id,
      NULL,
      p_week_end,
      p_status,
      v_budget,
      '{}'::jsonb
    )
    RETURNING * INTO v_del;
  EXCEPTION
    WHEN unique_violation THEN
      SELECT d.*
      INTO v_del
      FROM public.deliveries d
      WHERE d.subscription_id = p_subscription_id
        AND d.scheduled_date = p_week_end
      LIMIT 1;
  END;

  PERFORM public.sync_open_delivery_indexes(p_subscription_id);
  SELECT * INTO v_del FROM public.deliveries WHERE id = v_del.id;
  RETURN v_del;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_delivery_row_for_sunday(uuid, date, date, public.delivery_status_enum) FROM PUBLIC;

-- 6) Admin ensure: after loop, sync all so "beginning of week" assigns indexes
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

    -- Assign/clear indexes for this sub (current week vs future)
    PERFORM public.sync_open_delivery_indexes(r.subscription_id);
  END LOOP;

  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_open_deliveries_for_market_week(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_open_deliveries_for_market_week(date, date) TO authenticated;

-- 7) One-shot backfill
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT id FROM public.subscriptions
    WHERE status IN ('active', 'paused', 'completed')
  LOOP
    PERFORM public.sync_open_delivery_indexes(r.id);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
