-- Remove duplicate veg_categories (keep one row per name), then enforce UNIQUE(name).

-- 1. Point any vegetables pointing at a duplicate category to the kept row (if vegetables has category_id)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'vegetables' AND column_name = 'category_id') THEN
    WITH kept AS (
      SELECT DISTINCT ON (LOWER(name)) id, LOWER(name) AS key_name
      FROM public.veg_categories
      ORDER BY LOWER(name), id
    ),
    dupe_rows AS (
      SELECT vc.id, LOWER(vc.name) AS key_name
      FROM public.veg_categories vc
      WHERE vc.id NOT IN (SELECT id FROM kept)
    )
    UPDATE public.vegetables v
    SET category_id = k.id
    FROM dupe_rows dr
    JOIN kept k ON k.key_name = dr.key_name
    WHERE v.category_id = dr.id;
  END IF;
END $$;

-- 2. Delete duplicate category rows
WITH kept AS (
  SELECT DISTINCT ON (LOWER(name)) id
  FROM public.veg_categories
  ORDER BY LOWER(name), id
)
DELETE FROM public.veg_categories
WHERE id NOT IN (SELECT id FROM kept);

-- 3. Ensure UNIQUE(name) so duplicates cannot reappear
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
