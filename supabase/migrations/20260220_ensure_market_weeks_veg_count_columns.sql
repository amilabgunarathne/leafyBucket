-- Ensure market_weeks has veg_count_* columns (fixes "Could not find veg_count_large in schema cache").
-- Run this if saving week veg counts in Admin fails. Safe to run multiple times (IF NOT EXISTS).

ALTER TABLE public.market_weeks
  ADD COLUMN IF NOT EXISTS veg_count_small INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS veg_count_medium INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS veg_count_large INTEGER DEFAULT NULL;

COMMENT ON COLUMN public.market_weeks.veg_count_small IS 'Vegetable count for Small/Mini bucket this week (e.g. 3 or 4). Null = use bucket type default.';
COMMENT ON COLUMN public.market_weeks.veg_count_medium IS 'Vegetable count for Medium bucket this week (e.g. 6 or 7).';
COMMENT ON COLUMN public.market_weeks.veg_count_large IS 'Vegetable count for Large bucket this week (e.g. 9 or 10).';

-- Tell PostgREST to reload schema so API sees the new columns (fixes "column not in schema cache" after migration).
NOTIFY pgrst, 'reload schema';
