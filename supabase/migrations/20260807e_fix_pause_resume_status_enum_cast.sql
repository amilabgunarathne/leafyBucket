-- Fix: subscriptions.status is subscription_status_enum, not text.
-- Run this now so Resume/Pause works.

DROP FUNCTION IF EXISTS public.set_my_subscription_paused(boolean, date);

CREATE OR REPLACE FUNCTION public.set_my_subscription_paused(
  p_paused boolean,
  p_current_week_start date
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub public.subscriptions%ROWTYPE;
  v_new_sub_status public.subscription_status_enum;
  v_new_del_status public.delivery_status_enum;
  v_cur_start date := p_current_week_start;
  v_cur_end date := p_current_week_start + 6;
  v_nxt_start date := p_current_week_start + 7;
  v_nxt_end date := p_current_week_start + 13;
  v_week record;
  v_next_index integer;
  v_budget numeric;
  v_updated int := 0;
  v_created int := 0;
  v_n int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_current_week_start IS NULL THEN
    RAISE EXCEPTION 'current week start is required';
  END IF;

  SELECT *
  INTO v_sub
  FROM public.subscriptions s
  WHERE s.user_id = auth.uid()
    AND s.status IN ('active', 'paused')
  ORDER BY s.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active or paused subscription';
  END IF;

  v_new_sub_status := CASE
    WHEN p_paused THEN 'paused'::public.subscription_status_enum
    ELSE 'active'::public.subscription_status_enum
  END;
  v_new_del_status := CASE
    WHEN p_paused THEN 'paused'::public.delivery_status_enum
    ELSE 'open'::public.delivery_status_enum
  END;

  UPDATE public.subscriptions
  SET status = v_new_sub_status,
      updated_at = timezone('utc'::text, now())
  WHERE id = v_sub.id;

  FOR v_week IN
    SELECT v_cur_start AS week_start, v_cur_end AS week_end
    UNION ALL
    SELECT v_nxt_start, v_nxt_end
  LOOP
    IF EXISTS (
      SELECT 1
      FROM public.deliveries d
      WHERE d.subscription_id = v_sub.id
        AND d.status IN ('open', 'paused')
        AND d.scheduled_date >= v_week.week_start
        AND d.scheduled_date <= v_week.week_end
    ) THEN
      UPDATE public.deliveries d
      SET status = v_new_del_status
      WHERE d.subscription_id = v_sub.id
        AND d.status IN ('open', 'paused')
        AND d.scheduled_date >= v_week.week_start
        AND d.scheduled_date <= v_week.week_end;

      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_updated := v_updated + v_n;
    ELSE
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
        v_budget := 0;
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
        v_week.week_end,
        v_new_del_status,
        v_budget,
        '{}'::jsonb
      );

      v_created := v_created + 1;
    END IF;
  END LOOP;

  IF NOT p_paused THEN
    UPDATE public.subscriptions
    SET next_delivery_date = v_cur_end,
        updated_at = timezone('utc'::text, now())
    WHERE id = v_sub.id;
  END IF;

  RETURN json_build_object(
    'subscription_id', v_sub.id,
    'subscription_status', v_new_sub_status::text,
    'delivery_status', v_new_del_status::text,
    'deliveries_updated', v_updated,
    'deliveries_created', v_created
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_my_subscription_paused(boolean, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_my_subscription_paused(boolean, date) TO authenticated;

NOTIFY pgrst, 'reload schema';
