-- Materialize final per-delivery vegetable lines into public.delivery_items for ops/procurement.
-- Source: market_week_bucket_vegetables + deliveries.customizations (same merge as the app).
-- Safe to re-run: upserts by (delivery_id, vegetable_id) and removes stale lines for that delivery.

CREATE TABLE IF NOT EXISTS public.delivery_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id uuid NOT NULL REFERENCES public.deliveries(id) ON DELETE CASCADE,
  vegetable_id text NOT NULL REFERENCES public.vegetables(id),
  weight text NOT NULL DEFAULT '0g',
  is_substituted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.delivery_items
  ADD COLUMN IF NOT EXISTS weight text NOT NULL DEFAULT '0g';

ALTER TABLE public.delivery_items
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now());

ALTER TABLE public.delivery_items
  ADD COLUMN IF NOT EXISTS is_substituted boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS delivery_items_delivery_vegetable_key
  ON public.delivery_items (delivery_id, vegetable_id);

CREATE INDEX IF NOT EXISTS delivery_items_delivery_id_idx
  ON public.delivery_items (delivery_id);

COMMENT ON TABLE public.delivery_items IS
  'Final veg list per delivery for packing/procurement. Built from weekly defaults + deliveries.customizations. Re-run materialize to override after customization reopens.';

COMMENT ON COLUMN public.delivery_items.weight IS
  'Human-readable weight for ops (e.g. 450g). Matches app allocation math at materialize time.';

COMMENT ON COLUMN public.delivery_items.is_substituted IS
  'True when customer added this veg (not in admin weekly defaults). False for default admin picks.';

ALTER TABLE public.delivery_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage delivery_items" ON public.delivery_items;
CREATE POLICY "Admins can manage delivery_items"
  ON public.delivery_items
  FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE OR REPLACE FUNCTION public.materialize_delivery_items_for_delivery(p_delivery_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  v_mw_id uuid;
  v_weekly_budget numeric;
  v_root_pct integer;
  v_leafy_pct integer;
  v_bushy_pct integer;
  v_root_count integer;
  v_leafy_count integer;
  v_bushy_count integer;
  v_share_sum integer;
BEGIN
  SELECT
    mw.id,
    COALESCE(d.weekly_budget, 0)::numeric,
    COALESCE(bt.root_budget_pct, 34),
    COALESCE(bt.leafy_budget_pct, 33),
    COALESCE(bt.bushy_budget_pct, 33),
    COALESCE(bt.root_count, 1),
    COALESCE(bt.leafy_count, 1),
    COALESCE(bt.bushy_count, 1)
  INTO
    v_mw_id,
    v_weekly_budget,
    v_root_pct,
    v_leafy_pct,
    v_bushy_pct,
    v_root_count,
    v_leafy_count,
    v_bushy_count
  FROM public.deliveries d
  INNER JOIN public.subscriptions s ON s.id = d.subscription_id
  INNER JOIN public.bucket_types bt ON bt.id = s.bucket_type_id
  INNER JOIN LATERAL (
    SELECT mw.*
    FROM public.market_weeks mw
    WHERE d.scheduled_date::date >= mw.week_start_date
      AND d.scheduled_date::date <= mw.week_end_date
    ORDER BY mw.week_start_date DESC NULLS LAST
    LIMIT 1
  ) mw ON true
  WHERE d.id = p_delivery_id;

  IF v_mw_id IS NULL THEN
    RETURN 0;
  END IF;

  IF v_weekly_budget <= 0 THEN
    SELECT GREATEST(((COALESCE(bt.monthly_price, 0) - COALESCE(bt.handling_fee, 0))::numeric) / 4.0, 0)
    INTO v_weekly_budget
    FROM public.deliveries d
    INNER JOIN public.subscriptions s ON s.id = d.subscription_id
    INNER JOIN public.bucket_types bt ON bt.id = s.bucket_type_id
    WHERE d.id = p_delivery_id;
  END IF;

  v_share_sum := GREATEST(v_root_pct + v_leafy_pct + v_bushy_pct, 1);

  CREATE TEMP TABLE IF NOT EXISTS _delivery_final_vegs (
    delivery_id uuid,
    vegetable_id text,
    category text,
    is_substituted boolean
  ) ON COMMIT DROP;

  TRUNCATE _delivery_final_vegs;

  INSERT INTO _delivery_final_vegs (delivery_id, vegetable_id, category, is_substituted)
  WITH delivery_ctx AS (
    SELECT d.id AS delivery_id, d.customizations, s.bucket_type_id
    FROM public.deliveries d
    INNER JOIN public.subscriptions s ON s.id = d.subscription_id
    WHERE d.id = p_delivery_id
  ),
  defaults AS (
    SELECT DISTINCT mwbv.vegetable_id::text AS vegetable_id
    FROM delivery_ctx dc
    INNER JOIN public.market_week_bucket_vegetables mwbv
      ON mwbv.market_week_id = v_mw_id
     AND mwbv.bucket_type_id = dc.bucket_type_id
  ),
  removed AS (
    SELECT jsonb_array_elements_text(COALESCE(dc.customizations->'removedVegetables', '[]'::jsonb)) AS vegetable_id
    FROM delivery_ctx dc
  ),
  added AS (
    SELECT jsonb_array_elements_text(COALESCE(dc.customizations->'addedVegetables', '[]'::jsonb)) AS vegetable_id
    FROM delivery_ctx dc
  ),
  customized_adds AS (
    SELECT a.vegetable_id
    FROM added a
    WHERE a.vegetable_id NOT IN (SELECT vegetable_id FROM defaults)
  ),
  final_ids AS (
    SELECT vegetable_id FROM defaults WHERE vegetable_id NOT IN (SELECT vegetable_id FROM removed)
    UNION
    SELECT vegetable_id FROM added
  )
  SELECT p_delivery_id, fi.vegetable_id,
    CASE LOWER(COALESCE(vc.name, ''))
      WHEN 'root' THEN 'root'
      WHEN 'leafy' THEN 'leafy'
      WHEN 'bushy' THEN 'bushy'
      ELSE 'bushy'
    END,
    EXISTS (SELECT 1 FROM customized_adds ca WHERE ca.vegetable_id = fi.vegetable_id)
  FROM final_ids fi
  INNER JOIN public.vegetables v ON v.id = fi.vegetable_id
  LEFT JOIN public.veg_categories vc ON vc.id = v.category_id
  WHERE COALESCE(v.is_available_bulk, true) = true;

  DELETE FROM public.delivery_items di
  WHERE di.delivery_id = p_delivery_id
    AND NOT EXISTS (
      SELECT 1 FROM _delivery_final_vegs fv WHERE fv.vegetable_id = di.vegetable_id
    );

  WITH cat_counts AS (
    SELECT category, COUNT(*)::integer AS cnt
    FROM _delivery_final_vegs
    GROUP BY category
  ),
  priced AS (
    SELECT
      fv.vegetable_id,
      fv.is_substituted,
      fv.category,
      cc.cnt AS items_in_category,
      CASE fv.category
        WHEN 'root' THEN v_root_pct
        WHEN 'leafy' THEN v_leafy_pct
        WHEN 'bushy' THEN v_bushy_pct
        ELSE 34
      END AS cat_pct,
      CASE fv.category
        WHEN 'root' THEN v_root_count
        WHEN 'leafy' THEN v_leafy_count
        WHEN 'bushy' THEN v_bushy_count
        ELSE 1
      END AS target_count,
      GREATEST(
        COALESCE(
          (SELECT mp.price_per_unit
           FROM public.market_prices mp
           WHERE mp.market_week_id = v_mw_id
             AND mp.vegetable_id = fv.vegetable_id),
          0
        ),
        COALESCE(NULLIF(v.bulk_price_per_250g, 0), 0),
        COALESCE(NULLIF(v.market_price_per_250g::numeric, 0), 0)
      ) AS price_per_250g
    FROM _delivery_final_vegs fv
    INNER JOIN public.vegetables v ON v.id = fv.vegetable_id
    INNER JOIN cat_counts cc ON cc.category = fv.category
  ),
  allocated AS (
    SELECT
      p.vegetable_id,
      p.is_substituted,
      CASE
        WHEN p.price_per_250g > 0 THEN
          GREATEST(
            0,
            ROUND(
              (
                FLOOR(
                  ((p.cat_pct::numeric / v_share_sum) * v_weekly_budget)
                  / GREATEST(p.items_in_category, p.target_count)
                )::numeric / p.price_per_250g
              ) * 250
            )
          )::integer
        ELSE 0
      END AS weight_g
    FROM priced p
  ),
  upserted AS (
    INSERT INTO public.delivery_items (delivery_id, vegetable_id, weight, is_substituted, updated_at)
    SELECT
      p_delivery_id,
      a.vegetable_id,
      a.weight_g::text || 'g',
      a.is_substituted,
      timezone('utc'::text, now())
    FROM allocated a
    ON CONFLICT (delivery_id, vegetable_id)
    DO UPDATE SET
      weight = EXCLUDED.weight,
      is_substituted = EXCLUDED.is_substituted,
      updated_at = EXCLUDED.updated_at
    RETURNING 1
  )
  SELECT COUNT(*)::integer INTO v_count FROM upserted;

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.materialize_delivery_items_for_week(
  p_week_start date,
  p_week_end date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_delivery_id uuid;
  v_total_items integer := 0;
  v_deliveries integer := 0;
BEGIN
  IF p_week_start IS NULL OR p_week_end IS NULL OR p_week_end < p_week_start THEN
    RAISE EXCEPTION 'Invalid week range';
  END IF;

  FOR v_delivery_id IN
    SELECT d.id
    FROM public.deliveries d
    WHERE d.scheduled_date::date >= p_week_start
      AND d.scheduled_date::date <= p_week_end
      AND d.status NOT IN ('cancelled', 'skipped')
    ORDER BY d.scheduled_date, d.id
  LOOP
    v_total_items := v_total_items + public.materialize_delivery_items_for_delivery(v_delivery_id);
    v_deliveries := v_deliveries + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'deliveries_processed', v_deliveries,
    'items_upserted', v_total_items,
    'week_start', p_week_start,
    'week_end', p_week_end
  );
END;
$$;

CREATE OR REPLACE VIEW public.weekly_vegetable_procurement AS
SELECT
  mw.week_start_date,
  mw.week_end_date,
  di.vegetable_id,
  v.name AS vegetable_name,
  vc.name AS category,
  COUNT(DISTINCT di.delivery_id) AS delivery_count,
  SUM(NULLIF(regexp_replace(di.weight, '[^0-9.]', '', 'g'), '')::numeric) AS total_weight_g
FROM public.delivery_items di
INNER JOIN public.deliveries d ON d.id = di.delivery_id
INNER JOIN public.vegetables v ON v.id = di.vegetable_id
LEFT JOIN public.veg_categories vc ON vc.id = v.category_id
INNER JOIN LATERAL (
  SELECT mw.*
  FROM public.market_weeks mw
  WHERE d.scheduled_date::date >= mw.week_start_date
    AND d.scheduled_date::date <= mw.week_end_date
  ORDER BY mw.week_start_date DESC NULLS LAST
  LIMIT 1
) mw ON true
WHERE d.status NOT IN ('cancelled', 'skipped')
GROUP BY mw.week_start_date, mw.week_end_date, di.vegetable_id, v.name, vc.name
ORDER BY mw.week_start_date DESC, v.name;

COMMENT ON VIEW public.weekly_vegetable_procurement IS
  'Aggregated bulk purchase weights from delivery_items for a market week. Run materialize_delivery_items_for_week first.';

REVOKE ALL ON FUNCTION public.materialize_delivery_items_for_delivery(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.materialize_delivery_items_for_week(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.materialize_delivery_items_for_delivery(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.materialize_delivery_items_for_week(date, date) TO authenticated;
