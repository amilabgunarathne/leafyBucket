-- Supabase/PostgREST upsert(..., { onConflict: 'week_start_date' }) requires a conflict
-- arbiter Postgres can infer. A plain UNIQUE constraint on the column is more reliable than
-- a partial unique index (which can yield: "no unique or exclusion constraint matching the ON CONFLICT specification").
--
-- Safe if 20260415 was never applied (DROP INDEX is no-op). Dedupe duplicate week_start_date before applying.

DROP INDEX IF EXISTS public.market_weeks_week_start_date_uidx;

ALTER TABLE public.market_weeks
  DROP CONSTRAINT IF EXISTS market_weeks_week_start_date_key;

ALTER TABLE public.market_weeks
  ADD CONSTRAINT market_weeks_week_start_date_key UNIQUE (week_start_date);

COMMENT ON CONSTRAINT market_weeks_week_start_date_key ON public.market_weeks IS
  'One row per calendar week (Monday); app upserts on week_start_date.';
