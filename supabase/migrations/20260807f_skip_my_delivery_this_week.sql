-- Skip this week's delivery for the logged-in subscriber (open → skipped).
-- Does not change subscription status; next week is unchanged / still ensured separately.

CREATE OR REPLACE FUNCTION public.skip_my_delivery_this_week(
  p_week_start date,
  p_week_end date
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub public.subscriptions%ROWTYPE;
  v_del public.deliveries%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_week_start IS NULL OR p_week_end IS NULL THEN
    RAISE EXCEPTION 'week_start and week_end are required';
  END IF;

  SELECT *
  INTO v_sub
  FROM public.subscriptions s
  WHERE s.user_id = auth.uid()
    AND s.status = 'active'
  ORDER BY s.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active subscription (resume first if paused)';
  END IF;

  -- Prefer open delivery in this Mon–Sun week
  SELECT d.*
  INTO v_del
  FROM public.deliveries d
  WHERE d.subscription_id = v_sub.id
    AND d.status = 'open'
    AND d.scheduled_date >= p_week_start
    AND d.scheduled_date <= p_week_end
  ORDER BY d.scheduled_date ASC, d.delivery_index ASC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No open delivery to skip for this week';
  END IF;

  UPDATE public.deliveries
  SET status = 'skipped'
  WHERE id = v_del.id
  RETURNING * INTO v_del;

  RETURN json_build_object(
    'delivery_id', v_del.id,
    'scheduled_date', v_del.scheduled_date,
    'status', v_del.status::text
  );
END;
$$;

REVOKE ALL ON FUNCTION public.skip_my_delivery_this_week(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.skip_my_delivery_this_week(date, date) TO authenticated;

COMMENT ON FUNCTION public.skip_my_delivery_this_week(date, date) IS
  'Marks the caller’s open delivery in the given Mon–Sun week as skipped.';

NOTIFY pgrst, 'reload schema';
