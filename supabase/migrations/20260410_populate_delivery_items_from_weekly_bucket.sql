-- Backfill public.delivery_items from existing deliveries + admin weekly bucket lines.
-- Source of truth for “what veg goes in which bucket this week” matches the app:
--   market_week_bucket_vegetables (market_week_id, bucket_type_id, vegetable_id).
--
-- Field guide (contrast “needed” vs optional):
--   delivery_id      — REQUIRED. Links each line to one scheduled delivery.
--   vegetable_id     — REQUIRED. What product line this row represents.
--   category_id      — REQUIRED for reporting/filters; must match vegetables.category_id (denormalized).
--   allocated_budget — WANTED for pricing / bucket math; split evenly across lines here (simple backfill).
--   planned_quantity — WANTED before delivery day (often 1 “unit” per line in this model).
--   actual_quantity  — OPTIONAL until pack-out; backfill can copy planned or stay NULL until ops enter reals.
--   is_substituted   — OPTIONAL flag; false for historical/generated lines unless you know a swap happened.
--   id               — Auto (gen_random_uuid()) if not supplied.
--   created_at       — Auto (now()) if not supplied.
--
-- Prerequisites: deliveries.scheduled_date falls inside some market_weeks row; that week has rows in
-- market_week_bucket_vegetables for the subscription’s bucket_type_id. Otherwise this insert skips that delivery.

WITH base AS (
  -- One row per (delivery, vegetable). If two market_weeks overlap the same date, keep the latest week_start.
  SELECT DISTINCT ON (d.id, v.id)
    d.id AS delivery_id,
    d.weekly_budget,
    v.id AS vegetable_id,
    v.category_id
  FROM public.deliveries d
  INNER JOIN public.subscriptions s ON s.id = d.subscription_id
  INNER JOIN public.market_weeks mw
    ON d.scheduled_date::date >= mw.week_start_date
   AND d.scheduled_date::date <= mw.week_end_date
  INNER JOIN public.market_week_bucket_vegetables mwbv
    ON mwbv.market_week_id = mw.id
   AND mwbv.bucket_type_id = s.bucket_type_id
  INNER JOIN public.vegetables v ON v.id = mwbv.vegetable_id
  WHERE v.category_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.delivery_items di WHERE di.delivery_id = d.id
    )
  ORDER BY d.id, v.id, mw.week_start_date DESC NULLS LAST
),
counted AS (
  SELECT
    delivery_id,
    vegetable_id,
    category_id,
    weekly_budget,
    COUNT(*) OVER (PARTITION BY delivery_id) AS line_count
  FROM base
)
INSERT INTO public.delivery_items (
  id,
  delivery_id,
  vegetable_id,
  category_id,
  allocated_budget,
  planned_quantity,
  actual_quantity,
  is_substituted,
  created_at
)
SELECT
  gen_random_uuid(),
  delivery_id,
  vegetable_id,
  category_id,
  ROUND((weekly_budget::numeric) / NULLIF(line_count, 0), 2),
  1::numeric,
  1::numeric,
  false,
  timezone('utc'::text, now())
FROM counted;

-- If you need to re-run for new deliveries only, the NOT EXISTS guard prevents duplicates per delivery.
-- To rebuild from scratch (destructive):
--   TRUNCATE public.delivery_items;
--   then run the INSERT above again.
