-- Reliable read of the customer's payment method row (for My Bucket UI).
-- SECURITY DEFINER bypasses payment_methods RLS edge cases; still scoped by auth.uid().

CREATE OR REPLACE FUNCTION public.get_payment_method_for_my_subscription()
RETURNS json
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT row_to_json(t)::json
  FROM (
    SELECT pm.id, pm.code, pm.name, pm.description, pm.sort_order, pm.is_enabled
    FROM public.subscriptions s
    INNER JOIN public.payment_methods pm ON pm.id = s.payment_method_id
    WHERE s.user_id = auth.uid()
      AND s.status IN ('active', 'paused')
      AND s.payment_method_id IS NOT NULL
    LIMIT 1
  ) t;
$$;

REVOKE ALL ON FUNCTION public.get_payment_method_for_my_subscription() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_payment_method_for_my_subscription() TO authenticated;

COMMENT ON FUNCTION public.get_payment_method_for_my_subscription() IS
  'Returns payment_methods JSON for the caller''s active/paused subscription; null if none set.';
