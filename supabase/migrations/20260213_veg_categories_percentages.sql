-- Migrate category value distribution from ratios (4:3:2) to percentages (0-100).

-- Add percentage column (budget share %)
ALTER TABLE public.veg_categories
  ADD COLUMN IF NOT EXISTS budget_share_percent INTEGER DEFAULT NULL;

-- Backfill from soft_ratio_weight: 4:2:3 -> 44%, 22%, 34% (sum 100)
WITH totals AS (
  SELECT id, name, soft_ratio_weight,
    SUM(soft_ratio_weight) OVER () AS total
  FROM public.veg_categories
)
UPDATE public.veg_categories v
SET budget_share_percent = LEAST(100, GREATEST(0, ROUND(100.0 * t.soft_ratio_weight / NULLIF(t.total, 0))::INTEGER))
FROM totals t
WHERE v.id = t.id;

-- Ensure rows that didn't get a value have a default (spread evenly)
UPDATE public.veg_categories
SET budget_share_percent = 34
WHERE budget_share_percent IS NULL AND LOWER(name) = 'bushy';

UPDATE public.veg_categories
SET budget_share_percent = 22
WHERE budget_share_percent IS NULL AND LOWER(name) = 'leafy';

UPDATE public.veg_categories
SET budget_share_percent = 44
WHERE budget_share_percent IS NULL AND LOWER(name) = 'root';

-- Normalize so first category (by name) gets the remainder so sum = 100
DO $$
DECLARE
  first_id UUID;
  others_sum INT;
BEGIN
  SELECT id INTO first_id FROM public.veg_categories ORDER BY LOWER(name) LIMIT 1;
  SELECT COALESCE(SUM(budget_share_percent), 0) INTO others_sum FROM public.veg_categories WHERE id <> first_id AND budget_share_percent IS NOT NULL;
  UPDATE public.veg_categories SET budget_share_percent = GREATEST(0, LEAST(100, 100 - others_sum)) WHERE id = first_id;
END $$;
