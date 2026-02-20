-- Ensure market_weeks table exists with veg_count_* columns (fixes save failures when table was created elsewhere without them).
-- Safe to run multiple times. After this, run NOTIFY so PostgREST picks up columns.

CREATE TABLE IF NOT EXISTS public.market_weeks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start_date DATE,
  week_end_date DATE,
  is_locked BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  veg_count_small INTEGER DEFAULT NULL,
  veg_count_medium INTEGER DEFAULT NULL,
  veg_count_large INTEGER DEFAULT NULL
);

-- Add columns if table already existed without them (no-op if created above with them).
ALTER TABLE public.market_weeks
  ADD COLUMN IF NOT EXISTS veg_count_small INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS veg_count_medium INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS veg_count_large INTEGER DEFAULT NULL;

COMMENT ON COLUMN public.market_weeks.veg_count_small IS 'Vegetable count for Small/Mini bucket this week (e.g. 3 or 4). Null = use bucket type default.';
COMMENT ON COLUMN public.market_weeks.veg_count_medium IS 'Vegetable count for Medium bucket this week (e.g. 6 or 7).';
COMMENT ON COLUMN public.market_weeks.veg_count_large IS 'Vegetable count for Large bucket this week (e.g. 9 or 10).';

NOTIFY pgrst, 'reload schema';
