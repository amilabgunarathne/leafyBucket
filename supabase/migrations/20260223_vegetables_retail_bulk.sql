-- Add retail vs bulk price and availability for vegetables.
-- Retail: shop. Bulk: bucket / customization pool.

ALTER TABLE public.vegetables
  ADD COLUMN IF NOT EXISTS bulk_price_per_250g NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_available_retail BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_available_bulk BOOLEAN DEFAULT true;

-- Backfill: bulk price from retail where not yet set
UPDATE public.vegetables
SET bulk_price_per_250g = COALESCE(market_price_per_250g::numeric, 0)
WHERE bulk_price_per_250g = 0;

-- is_available_retail and is_available_bulk get DEFAULT true from ADD COLUMN; no backfill needed if is_available does not exist

COMMENT ON COLUMN public.vegetables.bulk_price_per_250g IS 'Price per 250g for bucket/customization; used when building weekly bucket.';
COMMENT ON COLUMN public.vegetables.is_available_retail IS 'If true, vegetable can appear in Shop.';
COMMENT ON COLUMN public.vegetables.is_available_bulk IS 'If true, vegetable can be included in bucket and customization pool.';
