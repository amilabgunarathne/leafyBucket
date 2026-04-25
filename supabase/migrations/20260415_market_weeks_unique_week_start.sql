-- Enforce at most one market_weeks row per calendar week (Monday = week_start_date).
-- Required for Supabase upsert(..., { onConflict: 'week_start_date' }) on Admin load/save.
-- Apply after removing duplicate week_start_date values (or on a fresh DB).

ALTER TABLE public.market_weeks
  DROP CONSTRAINT IF EXISTS market_weeks_week_start_date_key;

ALTER TABLE public.market_weeks
  ADD CONSTRAINT market_weeks_week_start_date_key UNIQUE (week_start_date);

COMMENT ON CONSTRAINT market_weeks_week_start_date_key ON public.market_weeks IS
  'Prevents duplicate weeks; app uses upsert on week_start_date.';
