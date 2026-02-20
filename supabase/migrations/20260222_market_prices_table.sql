-- 1) Remove duplicate rows: keep one per (market_week_id, vegetable_id), then add unique constraint.
DELETE FROM public.market_prices a
USING public.market_prices b
WHERE a.market_week_id = b.market_week_id
  AND a.vegetable_id = b.vegetable_id
  AND a.ctid < b.ctid;

ALTER TABLE public.market_prices DROP CONSTRAINT IF EXISTS market_prices_market_week_vegetable_key;
ALTER TABLE public.market_prices ADD CONSTRAINT market_prices_market_week_vegetable_key UNIQUE (market_week_id, vegetable_id);

-- 2) Upsert by delete-then-insert so one row per (market_week_id, vegetable_id) even if constraint missing.
CREATE OR REPLACE FUNCTION public.upsert_market_price(
  p_market_week_id UUID,
  p_vegetable_id TEXT,
  p_price_per_unit NUMERIC
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.market_prices
  WHERE market_week_id = p_market_week_id AND vegetable_id = p_vegetable_id;
  INSERT INTO public.market_prices (market_week_id, vegetable_id, price_per_unit)
  VALUES (p_market_week_id, p_vegetable_id, p_price_per_unit);
END;
$$;
