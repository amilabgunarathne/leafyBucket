-- Per-delivery bucket customizations (moved from subscriptions.customizations).
-- Each open delivery row holds the customer's veg deltas for that scheduled delivery.

ALTER TABLE public.deliveries
  ADD COLUMN IF NOT EXISTS customizations JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.deliveries.customizations IS
  'Customer bucket state for this delivery: excludedVegetables, removedVegetables, addedVegetables, deliveryDay. Legacy marketWeekId in migrated JSON is ignored by the app.';

-- 1) Prefer matching saved marketWeekId to the delivery whose scheduled_date falls in that market week.
UPDATE public.deliveries d
SET customizations = s.customizations
FROM public.subscriptions s
INNER JOIN public.market_weeks mw
  ON mw.id = (NULLIF(trim(s.customizations->>'marketWeekId'), ''))::uuid
WHERE s.id = d.subscription_id
  AND s.customizations IS NOT NULL
  AND s.customizations <> '{}'::jsonb
  AND NULLIF(trim(s.customizations->>'marketWeekId'), '') IS NOT NULL
  AND (s.customizations->>'marketWeekId') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  AND d.scheduled_date >= mw.week_start_date
  AND d.scheduled_date <= mw.week_end_date;

-- 2) Anything still only on the subscription row: attach to the earliest open delivery if no row was filled yet.
UPDATE public.deliveries d
SET customizations = s.customizations
FROM public.subscriptions s
WHERE s.id = d.subscription_id
  AND s.customizations IS NOT NULL
  AND s.customizations <> '{}'::jsonb
  AND d.customizations = '{}'::jsonb
  AND d.id = (
    SELECT d2.id
    FROM public.deliveries d2
    WHERE d2.subscription_id = s.id
      AND d2.status = 'open'
    ORDER BY d2.scheduled_date ASC, d2.delivery_index ASC
    LIMIT 1
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.deliveries d3
    WHERE d3.subscription_id = s.id
      AND d3.customizations IS NOT NULL
      AND d3.customizations <> '{}'::jsonb
  );

ALTER TABLE public.subscriptions
  DROP COLUMN IF EXISTS customizations;

-- Subscribers can read their own delivery rows (customizations + status for My Bucket).
DROP POLICY IF EXISTS "Users can view own deliveries" ON public.deliveries;
CREATE POLICY "Users can view own deliveries"
  ON public.deliveries
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.subscriptions s
      WHERE s.id = deliveries.subscription_id
        AND s.user_id = auth.uid()
    )
  );

COMMENT ON POLICY "Users can view own deliveries" ON public.deliveries IS
  'Subscribers list deliveries for their subscription (scheduled_date, customizations, status).';

-- Safe update path: only customizations on own open delivery (no broad subscriber UPDATE on deliveries).
CREATE OR REPLACE FUNCTION public.save_my_delivery_customizations(p_delivery_id uuid, p_customizations jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.deliveries d
  SET customizations = p_customizations
  FROM public.subscriptions s
  WHERE d.id = p_delivery_id
    AND d.subscription_id = s.id
    AND s.user_id = auth.uid()
    AND d.status = 'open';

  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN
    RAISE EXCEPTION 'Delivery not found, not open, or not owned by the current user';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.save_my_delivery_customizations(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_my_delivery_customizations(uuid, jsonb) TO authenticated;

COMMENT ON FUNCTION public.save_my_delivery_customizations(uuid, jsonb) IS
  'Persists deliveries.customizations for the caller’s open delivery only (subscription must belong to auth.uid()).';
