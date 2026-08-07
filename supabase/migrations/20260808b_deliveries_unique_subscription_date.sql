-- Strict rule: one delivery row per (subscription_id, scheduled_date) — any status.
-- Previous 20260808_dedupe only unique'd open/paused; this replaces that with a full unique.

-- ---------------------------------------------------------------------------
-- Root cause (why duplicates appeared)
-- ---------------------------------------------------------------------------
-- Several independent writers insert deliveries after a non-atomic "if missing" check:
--   1) AdminPage loadData → ensure_open_deliveries_for_market_week (current + next Sunday)
--   2) Customer login / My Bucket / Customize → ensure_my_open_delivery_for_week
--   3) Pause/resume → may insert current + next Sunday
--   4) Skip → may insert next Sunday
-- Two of these can run at nearly the same time, both see "no row", both INSERT
-- → two rows with the same subscription_id + scheduled_date (e.g. both open on 2026-08-09).
-- Bucket swap does NOT create these; it only updates subscriptions.bucket_type_id.

-- 1) Drop partial unique (open/paused only)
DROP INDEX IF EXISTS public.deliveries_unique_open_paused_per_sub_date;

-- 2) Deduplicate: keep best row per (subscription_id, scheduled_date); remove extras.
-- Clear FK children first, then delete loser delivery rows. (No temp tables.)

-- customisation_actions
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'customisation_actions'
  ) THEN
    DELETE FROM public.customisation_actions ca
    WHERE ca.delivery_id IN (
      SELECT id FROM (
        SELECT
          id,
          ROW_NUMBER() OVER (
            PARTITION BY subscription_id, scheduled_date
            ORDER BY
              CASE status::text
                WHEN 'delivered' THEN 1
                WHEN 'open' THEN 2
                WHEN 'paused' THEN 3
                WHEN 'locked' THEN 4
                WHEN 'skipped' THEN 5
                WHEN 'cancelled' THEN 6
                ELSE 7
              END ASC,
              delivery_index ASC,
              id ASC
          ) AS rn
        FROM public.deliveries
      ) r
      WHERE r.rn > 1
    );
  END IF;
END $$;

-- delivery_items
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'delivery_items'
  ) THEN
    DELETE FROM public.delivery_items di
    WHERE di.delivery_id IN (
      SELECT id FROM (
        SELECT
          id,
          ROW_NUMBER() OVER (
            PARTITION BY subscription_id, scheduled_date
            ORDER BY
              CASE status::text
                WHEN 'delivered' THEN 1
                WHEN 'open' THEN 2
                WHEN 'paused' THEN 3
                WHEN 'locked' THEN 4
                WHEN 'skipped' THEN 5
                WHEN 'cancelled' THEN 6
                ELSE 7
              END ASC,
              delivery_index ASC,
              id ASC
          ) AS rn
        FROM public.deliveries
      ) r
      WHERE r.rn > 1
    );
  END IF;
END $$;

-- subscription_events.delivery_id
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'subscription_events'
  ) THEN
    UPDATE public.subscription_events se
    SET delivery_id = NULL
    WHERE se.delivery_id IN (
      SELECT id FROM (
        SELECT
          id,
          ROW_NUMBER() OVER (
            PARTITION BY subscription_id, scheduled_date
            ORDER BY
              CASE status::text
                WHEN 'delivered' THEN 1
                WHEN 'open' THEN 2
                WHEN 'paused' THEN 3
                WHEN 'locked' THEN 4
                WHEN 'skipped' THEN 5
                WHEN 'cancelled' THEN 6
                ELSE 7
              END ASC,
              delivery_index ASC,
              id ASC
          ) AS rn
        FROM public.deliveries
      ) r
      WHERE r.rn > 1
    );
  END IF;
END $$;

-- Delete duplicate delivery rows
DELETE FROM public.deliveries d
WHERE d.id IN (
  SELECT id FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY subscription_id, scheduled_date
        ORDER BY
          CASE status::text
            WHEN 'delivered' THEN 1
            WHEN 'open' THEN 2
            WHEN 'paused' THEN 3
            WHEN 'locked' THEN 4
            WHEN 'skipped' THEN 5
            WHEN 'cancelled' THEN 6
            ELSE 7
          END ASC,
          delivery_index ASC,
          id ASC
      ) AS rn
    FROM public.deliveries
  ) r
  WHERE r.rn > 1
);

-- 3) Hard unique: one row per subscription + date
CREATE UNIQUE INDEX IF NOT EXISTS deliveries_unique_subscription_scheduled_date
  ON public.deliveries (subscription_id, scheduled_date);

COMMENT ON INDEX public.deliveries_unique_subscription_scheduled_date IS
  'At most one delivery per subscription_id + scheduled_date (any status).';

-- 4) Safe helper: never insert a second row for the same Sunday
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
  v_next_index integer;
  v_budget numeric;
BEGIN
  IF p_subscription_id IS NULL OR p_week_start IS NULL OR p_week_end IS NULL THEN
    RAISE EXCEPTION 'subscription_id, week_start, week_end required';
  END IF;

  IF p_status IS DISTINCT FROM 'open' AND p_status IS DISTINCT FROM 'paused' THEN
    RAISE EXCEPTION 'ensure_delivery_row_for_sunday only creates open or paused';
  END IF;

  -- Any existing row on this Sunday (any status) → reuse / realign, never insert another
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
    -- Do not reopen delivered/locked/cancelled via ensure
    IF v_del.status IN ('delivered', 'locked') THEN
      RETURN v_del;
    END IF;
    IF v_del.status = 'skipped' THEN
      RETURN v_del;
    END IF;
    IF v_del.status = 'cancelled' THEN
      UPDATE public.deliveries
      SET status = p_status,
          delivery_index = public.next_delivery_index_for_subscription(p_subscription_id)
      WHERE id = v_del.id
      RETURNING * INTO v_del;
      RETURN v_del;
    END IF;
    -- open / paused
    IF v_del.status IS DISTINCT FROM p_status THEN
      UPDATE public.deliveries
      SET status = p_status
      WHERE id = v_del.id
      RETURNING * INTO v_del;
    END IF;
    RETURN v_del;
  END IF;

  v_next_index := public.next_delivery_index_for_subscription(p_subscription_id);

  SELECT d.weekly_budget INTO v_budget
  FROM public.deliveries d
  WHERE d.subscription_id = p_subscription_id
  ORDER BY d.scheduled_date DESC, d.delivery_index DESC
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
      v_next_index,
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

  RETURN v_del;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_delivery_row_for_sunday(uuid, date, date, public.delivery_status_enum) FROM PUBLIC;

NOTIFY pgrst, 'reload schema';
