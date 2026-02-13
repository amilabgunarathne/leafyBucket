-- Schema alignment for Leafy Bucket admin & app
-- Run in Supabase SQL Editor (one block or step by step).

-- =============================================================================
-- 1. VEGETABLES: use is_available (app reads/writes this column)
--    If your table only has is_active, run the block below to add is_available and copy values.
-- =============================================================================
-- Run only if vegetables has is_active but NOT is_available:
-- ALTER TABLE public.vegetables ADD COLUMN IF NOT EXISTS is_available BOOLEAN DEFAULT true;
-- UPDATE public.vegetables SET is_available = COALESCE(is_active, true);
-- Then you can drop is_active later if desired: ALTER TABLE public.vegetables DROP COLUMN IF EXISTS is_active;

-- =============================================================================
-- 2. BUCKET_TYPES: optional columns for per-category limits (root, bushy, leafy)
--    Only run if you want the app to use these for customization limits.
-- =============================================================================
ALTER TABLE public.bucket_types
  ADD COLUMN IF NOT EXISTS root_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bushy_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS leafy_count INTEGER DEFAULT 0;

-- =============================================================================
-- 3. MARKET_PRICES: unique constraint for upsert (one price per vegetable per week)
-- =============================================================================
ALTER TABLE public.market_prices
  DROP CONSTRAINT IF EXISTS market_prices_market_week_vegetable_key;

ALTER TABLE public.market_prices
  ADD CONSTRAINT market_prices_market_week_vegetable_key
  UNIQUE (market_week_id, vegetable_id);

-- =============================================================================
-- 4. MARKET_WEEKS: RLS so admins can manage (if you use RLS on this table)
-- =============================================================================
-- If market_weeks has RLS enabled, allow admins to do everything
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'market_weeks'
  ) THEN
    ALTER TABLE public.market_weeks ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Admins can manage market_weeks" ON public.market_weeks;
    CREATE POLICY "Admins can manage market_weeks" ON public.market_weeks
      FOR ALL
      USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
      )
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
      );

    DROP POLICY IF EXISTS "Public read market_weeks" ON public.market_weeks;
    CREATE POLICY "Public read market_weeks" ON public.market_weeks
      FOR SELECT USING (true);
  END IF;
END $$;

-- =============================================================================
-- 5. MARKET_PRICES: RLS so admins can manage
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'market_prices'
  ) THEN
    ALTER TABLE public.market_prices ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Admins can manage market_prices" ON public.market_prices;
    CREATE POLICY "Admins can manage market_prices" ON public.market_prices
      FOR ALL
      USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
      )
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
      );

    DROP POLICY IF EXISTS "Public read market_prices" ON public.market_prices;
    CREATE POLICY "Public read market_prices" ON public.market_prices
      FOR SELECT USING (true);
  END IF;
END $$;

-- =============================================================================
-- 6. BUCKET_TYPES: ensure updated_at if you use it (optional)
-- =============================================================================
ALTER TABLE public.bucket_types
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
