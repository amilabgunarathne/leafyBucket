-- Skip: move next_delivery_date to next week's Sunday (ensure next-week open row).
-- Unskip: move next_delivery_date back to this week's Sunday.

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
  v_nxt_start date := p_week_end + 1; -- next Monday
  v_nxt_end date := p_week_end + 7;   -- next Sunday
  v_next public.deliveries%ROWTYPE;
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
    AND s.status = 'active'
  ORDER BY s.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active subscription (resume first if paused)';
  END IF;

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

  -- Ensure next week has an open delivery to point next_delivery_date at
  SELECT d.*
  INTO v_next
  FROM public.deliveries d
  WHERE d.subscription_id = v_sub.id
    AND d.status IN ('open', 'paused')
    AND d.scheduled_date >= v_nxt_start
    AND d.scheduled_date <= v_nxt_end
  ORDER BY d.scheduled_date ASC, d.delivery_index ASC
  LIMIT 1;

  IF NOT FOUND THEN
    SELECT COALESCE(MAX(d.delivery_index), 0) + 1
    INTO v_next_index
    FROM public.deliveries d
    WHERE d.subscription_id = v_sub.id;

    SELECT d.weekly_budget INTO v_budget
    FROM public.deliveries d
    WHERE d.subscription_id = v_sub.id
    ORDER BY d.delivery_index DESC
    LIMIT 1;

    IF v_budget IS NULL THEN
      v_budget := COALESCE(v_del.weekly_budget, 0);
    END IF;

    INSERT INTO public.deliveries (
      subscription_id,
      delivery_index,
      scheduled_date,
      status,
      weekly_budget,
      customizations
    ) VALUES (
      v_sub.id,
      v_next_index,
      v_nxt_end,
      'open',
      v_budget,
      '{}'::jsonb
    )
    RETURNING * INTO v_next;
  ELSIF v_next.status = 'paused' THEN
    UPDATE public.deliveries
    SET status = 'open'
    WHERE id = v_next.id
    RETURNING * INTO v_next;
  END IF;

  UPDATE public.subscriptions
  SET next_delivery_date = v_next.scheduled_date,
      updated_at = timezone('utc'::text, now())
  WHERE id = v_sub.id;

  RETURN json_build_object(
    'delivery_id', v_del.id,
    'scheduled_date', v_del.scheduled_date,
    'status', v_del.status::text,
    'next_delivery_date', v_next.scheduled_date
  );
END;
$$;

REVOKE ALL ON FUNCTION public.skip_my_delivery_this_week(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.skip_my_delivery_this_week(date, date) TO authenticated;

COMMENT ON FUNCTION public.skip_my_delivery_this_week(date, date) IS
  'Skip this week’s open delivery; set next_delivery_date to next week’s Sunday (creates that row if needed).';

CREATE OR REPLACE FUNCTION public.unskip_my_delivery_this_week(
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
    RAISE EXCEPTION 'No active subscription';
  END IF;

  SELECT d.*
  INTO v_del
  FROM public.deliveries d
  WHERE d.subscription_id = v_sub.id
    AND d.status = 'skipped'
    AND d.scheduled_date >= p_week_start
    AND d.scheduled_date <= p_week_end
  ORDER BY d.scheduled_date ASC, d.delivery_index ASC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No skipped delivery to resume for this week';
  END IF;

  UPDATE public.deliveries
  SET status = 'open'
  WHERE id = v_del.id
  RETURNING * INTO v_del;

  -- Shift next delivery back to this week
  UPDATE public.subscriptions
  SET next_delivery_date = v_del.scheduled_date,
      updated_at = timezone('utc'::text, now())
  WHERE id = v_sub.id;

  RETURN json_build_object(
    'delivery_id', v_del.id,
    'scheduled_date', v_del.scheduled_date,
    'status', v_del.status::text,
    'next_delivery_date', v_del.scheduled_date
  );
END;
$$;

REVOKE ALL ON FUNCTION public.unskip_my_delivery_this_week(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unskip_my_delivery_this_week(date, date) TO authenticated;

COMMENT ON FUNCTION public.unskip_my_delivery_this_week(date, date) IS
  'Resume this week’s skipped delivery to open; set next_delivery_date back to this week’s Sunday.';

NOTIFY pgrst, 'reload schema';
