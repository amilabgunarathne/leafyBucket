-- Packing / materialize hardening after mid-week bucket change (e.g. Mini → Family+):
-- 1) Admin can read all subscriptions (packing list must see every customer).
-- 2) Rematerialize must NOT wipe existing delivery_items when computed list is empty.
-- 3) Use a per-call temp table (DROP + CREATE) to avoid cross-delivery reuse bugs.

-- -----------------------------------------------------------------------------
-- 1. Admin SELECT on subscriptions (keep subscriber write access)
-- -----------------------------------------------------------------------------
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view all subscriptions" ON public.subscriptions;
CREATE POLICY "Admins can view all subscriptions"
  ON public.subscriptions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

DROP POLICY IF EXISTS "Users can view own subscriptions" ON public.subscriptions;
CREATE POLICY "Users can view own subscriptions"
  ON public.subscriptions
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own subscriptions" ON public.subscriptions;
CREATE POLICY "Users can insert own subscriptions"
  ON public.subscriptions
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own subscriptions" ON public.subscriptions;
CREATE POLICY "Users can update own subscriptions"
  ON public.subscriptions
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins can manage all subscriptions" ON public.subscriptions;
CREATE POLICY "Admins can manage all subscriptions"
  ON public.subscriptions
  FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- -----------------------------------------------------------------------------
-- 2. Safe materialize
-- -----------------------------------------------------------------------------
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
  v_final_count integer;
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

  DROP TABLE IF EXISTS _delivery_final_vegs;
  CREATE TEMP TABLE _delivery_final_vegs (
    vegetable_id text PRIMARY KEY,
    category text NOT NULL,
    is_substituted boolean NOT NULL DEFAULT false
  ) ON COMMIT DROP;

  INSERT INTO _delivery_final_vegs (vegetable_id, category, is_substituted)
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
  SELECT
    fi.vegetable_id,
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

  SELECT COUNT(*)::integer INTO v_final_count FROM _delivery_final_vegs;

  -- Keep previously packed lines when we cannot resolve a new list (missing week veggies, etc.)
  IF COALESCE(v_final_count, 0) = 0 THEN
    DROP TABLE IF EXISTS _delivery_final_vegs;
    RETURN 0;
  END IF;

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
    INSERT INTO public.delivery_items (delivery_id, market_week_id, vegetable_id, weight, is_substituted, updated_at)
    SELECT
      p_delivery_id,
      v_mw_id,
      a.vegetable_id,
      a.weight_g::text || 'g',
      a.is_substituted,
      timezone('utc'::text, now())
    FROM allocated a
    ON CONFLICT (delivery_id, vegetable_id)
    DO UPDATE SET
      market_week_id = EXCLUDED.market_week_id,
      weight = EXCLUDED.weight,
      is_substituted = EXCLUDED.is_substituted,
      updated_at = EXCLUDED.updated_at
    RETURNING 1
  )
  SELECT COUNT(*)::integer INTO v_count FROM upserted;

  DROP TABLE IF EXISTS _delivery_final_vegs;
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.materialize_delivery_items_for_delivery(uuid) IS
  'Build delivery_items for one delivery. Never deletes existing rows when the computed veg list is empty.';

NOTIFY pgrst, 'reload schema';
