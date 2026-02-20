-- Manually assigned vegetables per bucket type per market week (before customization opens).
-- When set, these are used as the default selection for that bucket; otherwise shuffle is used.

CREATE TABLE IF NOT EXISTS public.market_week_bucket_vegetables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_week_id UUID NOT NULL REFERENCES public.market_weeks(id) ON DELETE CASCADE,
  bucket_type_id UUID NOT NULL REFERENCES public.bucket_types(id) ON DELETE CASCADE,
  vegetable_id TEXT NOT NULL REFERENCES public.vegetables(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE(market_week_id, bucket_type_id, vegetable_id)
);

CREATE INDEX IF NOT EXISTS idx_mwbv_week_bucket
  ON public.market_week_bucket_vegetables(market_week_id, bucket_type_id);

ALTER TABLE public.market_week_bucket_vegetables ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read market_week_bucket_vegetables" ON public.market_week_bucket_vegetables;
CREATE POLICY "Public read market_week_bucket_vegetables" ON public.market_week_bucket_vegetables FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins manage market_week_bucket_vegetables" ON public.market_week_bucket_vegetables;
CREATE POLICY "Admins manage market_week_bucket_vegetables" ON public.market_week_bucket_vegetables
  FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

COMMENT ON TABLE public.market_week_bucket_vegetables IS 'Admin-set vegetables per bucket type per week. Used as default selection when set; otherwise shuffle.';
