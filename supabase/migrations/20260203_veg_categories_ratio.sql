-- Category value ratios for budget allocation (Root : Bushy : Leafy). Admin can edit in dashboard.
-- Creates veg_categories if missing; ensures soft_ratio_weight exists and has defaults.

-- Create table if not present (e.g. for new projects)
CREATE TABLE IF NOT EXISTS public.veg_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  soft_ratio_weight INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure ratio and timestamp columns exist if table was created without them
ALTER TABLE public.veg_categories ADD COLUMN IF NOT EXISTS soft_ratio_weight INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public.veg_categories ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.veg_categories ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Ensure UNIQUE(name) exists so ON CONFLICT (name) works (table may have been created without it)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey) AND NOT a.attisdropped
    WHERE c.conrelid = 'public.veg_categories'::regclass AND c.contype = 'u' AND a.attname = 'name'
  ) THEN
    ALTER TABLE public.veg_categories ADD CONSTRAINT veg_categories_name_key UNIQUE (name);
  END IF;
END $$;

-- Seed default ratios: Root (4) : Bushy (3) : Leafy (2)
INSERT INTO public.veg_categories (name, soft_ratio_weight)
VALUES
  ('root', 4),
  ('leafy', 2),
  ('bushy', 3)
ON CONFLICT (name) DO UPDATE SET
  soft_ratio_weight = EXCLUDED.soft_ratio_weight,
  updated_at = NOW();

-- RLS: public read, admins can update (for ratio editing)
ALTER TABLE public.veg_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read veg_categories" ON public.veg_categories;
CREATE POLICY "Public read veg_categories" ON public.veg_categories
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins can manage veg_categories" ON public.veg_categories;
CREATE POLICY "Admins can manage veg_categories" ON public.veg_categories
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );
