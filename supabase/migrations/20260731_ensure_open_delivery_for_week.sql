-- Ensure the logged-in subscriber has an open delivery to attach customizations to
-- for the current market week (creates one on week Sunday if missing).

CREATE OR REPLACE FUNCTION public.ensure_my_open_delivery_for_week(
  p_week_start date,
  p_week_end date
)
RETURNS public.deliveries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub public.subscriptions%ROWTYPE;
  v_del public.deliveries%ROWTYPE;
  v_next_index integer;
  v_budget numeric;
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
    AND s.status IN ('active', 'paused')
  ORDER BY s.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active subscription';
  END IF;

  -- Prefer open delivery already scheduled in this Mon–Sun week
  SELECT d.*
  INTO v_del
  FROM public.deliveries d
  WHERE d.subscription_id = v_sub.id
    AND d.status = 'open'
    AND d.scheduled_date >= p_week_start
    AND d.scheduled_date <= p_week_end
  ORDER BY d.scheduled_date ASC, d.delivery_index ASC
  LIMIT 1;

  IF FOUND THEN
    RETURN v_del;
  END IF;

  -- Else next upcoming open on/after this Monday
  SELECT d.*
  INTO v_del
  FROM public.deliveries d
  WHERE d.subscription_id = v_sub.id
    AND d.status = 'open'
    AND d.scheduled_date >= p_week_start
  ORDER BY d.scheduled_date ASC, d.delivery_index ASC
  LIMIT 1;

  IF FOUND THEN
    RETURN v_del;
  END IF;

  -- Create open delivery for this week's Sunday (week_end)
  SELECT COALESCE(MAX(d.delivery_index), 0) + 1
  INTO v_next_index
  FROM public.deliveries d
  WHERE d.subscription_id = v_sub.id;

  SELECT d.weekly_budget
  INTO v_budget
  FROM public.deliveries d
  WHERE d.subscription_id = v_sub.id
  ORDER BY d.delivery_index DESC
  LIMIT 1;

  IF v_budget IS NULL THEN
    v_budget := 0;
  END IF;

  INSERT INTO public.deliveries (
    subscription_id,
    delivery_index,
    scheduled_date,
    status,
    weekly_budget,
    customizations
  )
  VALUES (
    v_sub.id,
    v_next_index,
    p_week_end,
    'open',
    v_budget,
    '{}'::jsonb
  )
  RETURNING * INTO v_del;

  UPDATE public.subscriptions
  SET next_delivery_date = p_week_end,
      updated_at = timezone('utc'::text, now())
  WHERE id = v_sub.id
    AND (next_delivery_date IS NULL OR next_delivery_date < p_week_start);

  RETURN v_del;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_my_open_delivery_for_week(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_my_open_delivery_for_week(date, date) TO authenticated;

COMMENT ON FUNCTION public.ensure_my_open_delivery_for_week(date, date) IS
  'Returns an open delivery in/after the given week for the caller’s subscription; creates one on week_end if none exist.';

NOTIFY pgrst, 'reload schema';
