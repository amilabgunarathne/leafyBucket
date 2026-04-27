-- Open/close customization now lives only on public.market_weeks (open_dow, open_time, close_dow, close_time).
-- The legacy customization_schedule single-row table is unused by the app; drop it.

DROP TABLE IF EXISTS public.customization_schedule;
