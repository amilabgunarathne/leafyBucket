-- Per-week vegetable count per plan (admin chooses to minimize price volatility).
-- Mini typically 3-4, Medium 6-7, Large 9-10; admin sets exact count for each week.

ALTER TABLE public.market_weeks
  ADD COLUMN IF NOT EXISTS veg_count_small INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS veg_count_medium INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS veg_count_large INTEGER DEFAULT NULL;

COMMENT ON COLUMN public.market_weeks.veg_count_small IS 'Vegetable count for Small/Mini bucket this week (e.g. 3 or 4). Null = use bucket type default.';
COMMENT ON COLUMN public.market_weeks.veg_count_medium IS 'Vegetable count for Medium bucket this week (e.g. 6 or 7).';
COMMENT ON COLUMN public.market_weeks.veg_count_large IS 'Vegetable count for Large bucket this week (e.g. 9 or 10).';
