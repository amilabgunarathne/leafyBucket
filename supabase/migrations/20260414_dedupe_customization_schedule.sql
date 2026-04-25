-- Remove duplicate rows in customization_schedule; keep the single canonical row
-- (the one with the latest updated_at). Safe when exactly 2 rows exist.

DELETE FROM public.customization_schedule
WHERE id <> (
  SELECT id
  FROM public.customization_schedule
  ORDER BY updated_at DESC NULLS LAST
  LIMIT 1
);
