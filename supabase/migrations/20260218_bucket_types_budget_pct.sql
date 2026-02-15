-- Store category budget share % on bucket_types so Customization and Admin use one source of truth.
-- root_count/leafy_count/bushy_count = how many items per category; *_budget_pct = how to split the budget (0-100).

ALTER TABLE public.bucket_types
  ADD COLUMN IF NOT EXISTS root_budget_pct INTEGER DEFAULT 34 CHECK (root_budget_pct >= 0 AND root_budget_pct <= 100),
  ADD COLUMN IF NOT EXISTS leafy_budget_pct INTEGER DEFAULT 33 CHECK (leafy_budget_pct >= 0 AND leafy_budget_pct <= 100),
  ADD COLUMN IF NOT EXISTS bushy_budget_pct INTEGER DEFAULT 33 CHECK (bushy_budget_pct >= 0 AND bushy_budget_pct <= 100);

-- Backfill from bucket_type_category_ratios if that table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'bucket_type_category_ratios') THEN
    UPDATE public.bucket_types bt SET root_budget_pct = COALESCE(r.budget_share_percent, 34)
    FROM public.bucket_type_category_ratios r
    JOIN public.veg_categories v ON v.id = r.veg_category_id AND LOWER(v.name) = 'root'
    WHERE r.bucket_type_id = bt.id;
    UPDATE public.bucket_types bt SET leafy_budget_pct = COALESCE(r.budget_share_percent, 33)
    FROM public.bucket_type_category_ratios r
    JOIN public.veg_categories v ON v.id = r.veg_category_id AND LOWER(v.name) = 'leafy'
    WHERE r.bucket_type_id = bt.id;
    UPDATE public.bucket_types bt SET bushy_budget_pct = COALESCE(r.budget_share_percent, 33)
    FROM public.bucket_type_category_ratios r
    JOIN public.veg_categories v ON v.id = r.veg_category_id AND LOWER(v.name) = 'bushy'
    WHERE r.bucket_type_id = bt.id;
  END IF;
END $$;

-- Ensure defaults where still null
UPDATE public.bucket_types SET root_budget_pct = 34 WHERE root_budget_pct IS NULL;
UPDATE public.bucket_types SET leafy_budget_pct = 33 WHERE leafy_budget_pct IS NULL;
UPDATE public.bucket_types SET bushy_budget_pct = 33 WHERE bushy_budget_pct IS NULL;

ALTER TABLE public.bucket_types
  ALTER COLUMN root_budget_pct SET NOT NULL,
  ALTER COLUMN leafy_budget_pct SET NOT NULL,
  ALTER COLUMN bushy_budget_pct SET NOT NULL;

COMMENT ON COLUMN public.bucket_types.root_budget_pct IS 'Budget share % for root category (0-100). With leafy/bushy should sum to 100.';
COMMENT ON COLUMN public.bucket_types.leafy_budget_pct IS 'Budget share % for leafy category (0-100).';
COMMENT ON COLUMN public.bucket_types.bushy_budget_pct IS 'Budget share % for bushy category (0-100).';
