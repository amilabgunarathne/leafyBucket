-- Per-bucket-type category budget share (root/leafy/bushy %). Each bucket type has its own ratios.
CREATE TABLE IF NOT EXISTS public.bucket_type_category_ratios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_type_id UUID NOT NULL REFERENCES public.bucket_types(id) ON DELETE CASCADE,
  veg_category_id UUID NOT NULL REFERENCES public.veg_categories(id) ON DELETE CASCADE,
  budget_share_percent INTEGER NOT NULL DEFAULT 34 CHECK (budget_share_percent >= 0 AND budget_share_percent <= 100),
  UNIQUE(bucket_type_id, veg_category_id)
);

CREATE INDEX IF NOT EXISTS idx_bucket_type_category_ratios_bucket_type
  ON public.bucket_type_category_ratios(bucket_type_id);

-- Seed: for each bucket type, create one row per veg_category with default from veg_categories or 34,33,33
INSERT INTO public.bucket_type_category_ratios (bucket_type_id, veg_category_id, budget_share_percent)
SELECT bt.id, vc.id, COALESCE(vc.budget_share_percent, (100 / 3)::INTEGER)
FROM public.bucket_types bt
CROSS JOIN public.veg_categories vc
WHERE NOT EXISTS (SELECT 1 FROM public.bucket_type_category_ratios r WHERE r.bucket_type_id = bt.id AND r.veg_category_id = vc.id);

-- Normalize to 100% where we have 3 categories per bucket (optional: run once to fix totals)
-- Leave as-is; admin will set per bucket.

ALTER TABLE public.bucket_type_category_ratios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read bucket_type_category_ratios" ON public.bucket_type_category_ratios;
CREATE POLICY "Public read bucket_type_category_ratios" ON public.bucket_type_category_ratios FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins manage bucket_type_category_ratios" ON public.bucket_type_category_ratios;
CREATE POLICY "Admins manage bucket_type_category_ratios" ON public.bucket_type_category_ratios
  FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

COMMENT ON TABLE public.bucket_type_category_ratios IS 'Category budget share % per bucket type (root, leafy, bushy). Independent per bucket (e.g. Mini vs Medium).';
