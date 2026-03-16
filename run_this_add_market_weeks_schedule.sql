-- Run this in Supabase Dashboard → SQL Editor to fix "Could not find close_dow in schema cache".
-- Adds open/close schedule columns to market_weeks so the Bucket types tab can save customization times.

ALTER TABLE public.market_weeks ADD COLUMN IF NOT EXISTS open_dow INTEGER DEFAULT 3;
ALTER TABLE public.market_weeks ADD COLUMN IF NOT EXISTS open_time TEXT DEFAULT '12:00';
ALTER TABLE public.market_weeks ADD COLUMN IF NOT EXISTS close_dow INTEGER DEFAULT 5;
ALTER TABLE public.market_weeks ADD COLUMN IF NOT EXISTS close_time TEXT DEFAULT '23:59';

COMMENT ON COLUMN public.market_weeks.open_dow IS 'Day of week customization opens (0=Sun .. 6=Sat).';
COMMENT ON COLUMN public.market_weeks.open_time IS 'Time customization opens (HH:MM 24h).';
COMMENT ON COLUMN public.market_weeks.close_dow IS 'Day of week customization closes.';
COMMENT ON COLUMN public.market_weeks.close_time IS 'Time customization closes (HH:MM 24h).';

NOTIFY pgrst, 'reload schema';
