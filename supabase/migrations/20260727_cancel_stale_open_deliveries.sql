-- When a new market week has begun, any still-open deliveries scheduled before this week's
-- Monday are stale (admin never marked delivered). Cancel them so the next open delivery becomes
-- current — and its empty customizations apply (previous week's JSON no longer surfaces).

CREATE OR REPLACE FUNCTION public.cancel_my_stale_open_deliveries(p_week_start date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n int := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_week_start IS NULL THEN
    RAISE EXCEPTION 'week_start is required';
  END IF;

  UPDATE public.deliveries d
  SET status = 'cancelled'
  FROM public.subscriptions s
  WHERE d.subscription_id = s.id
    AND s.user_id = auth.uid()
    AND s.status IN ('active', 'paused')
    AND d.status = 'open'
    AND d.scheduled_date < p_week_start;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_my_stale_open_deliveries(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_my_stale_open_deliveries(date) TO authenticated;

COMMENT ON FUNCTION public.cancel_my_stale_open_deliveries(date) IS
  'Cancels the caller’s open deliveries with scheduled_date before p_week_start (current Monday). Does not increment deliveries_used.';

NOTIFY pgrst, 'reload schema';
