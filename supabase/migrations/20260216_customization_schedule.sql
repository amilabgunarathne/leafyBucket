-- Customization window: when customers can edit their bucket (default Wed noon → Fri night).
-- Admin can change open/close and can lock individual weeks via market_weeks.is_locked.

CREATE TABLE IF NOT EXISTS public.customization_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  open_dow INTEGER NOT NULL DEFAULT 3,        -- 0 Sun, 1 Mon, ... 6 Sat. Default 3 = Wednesday
  open_time TEXT NOT NULL DEFAULT '12:00',   -- HH:MM (24h), default noon
  close_dow INTEGER NOT NULL DEFAULT 5,      -- Default 5 = Friday
  close_time TEXT NOT NULL DEFAULT '23:59',  -- HH:MM (24h), default end of Friday
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Single row: insert default if empty
INSERT INTO public.customization_schedule (id, open_dow, open_time, close_dow, close_time)
SELECT gen_random_uuid(), 3, '12:00', 5, '23:59'
WHERE NOT EXISTS (SELECT 1 FROM public.customization_schedule LIMIT 1);

ALTER TABLE public.customization_schedule ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read customization_schedule" ON public.customization_schedule;
CREATE POLICY "Public read customization_schedule" ON public.customization_schedule FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins manage customization_schedule" ON public.customization_schedule;
CREATE POLICY "Admins manage customization_schedule" ON public.customization_schedule
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

COMMENT ON TABLE public.customization_schedule IS 'Default window: open_dow 3 (Wed) at open_time 12:00, close_dow 5 (Fri) at close_time 23:59. market_weeks.is_locked overrides to close that week.';
