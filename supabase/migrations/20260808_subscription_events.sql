-- Ledger of subscriber (and admin) subscription actions — not payment failures.
-- event_data shape (optional): { "previous_data": {...}, "new_data": {...} }
-- reason: free-text for admin_override / notes when previous/new are not used.

CREATE TABLE IF NOT EXISTS public.subscription_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL
    CHECK (event_type IN (
      'created',
      'plan_changed',
      'paused',
      'resumed',
      'skipped',
      'unskipped',
      'cancelled',
      'payment_method_changed',
      'admin_override'
    )),
  event_data JSONB,
  reason TEXT,
  -- Optional link when the action is about a specific delivery (skip / unskip)
  delivery_id UUID REFERENCES public.deliveries(id) ON DELETE SET NULL,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role TEXT NOT NULL DEFAULT 'subscriber'
    CHECK (actor_role IN ('subscriber', 'admin', 'system')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS subscription_events_subscription_id_created_at_idx
  ON public.subscription_events (subscription_id, created_at DESC);

CREATE INDEX IF NOT EXISTS subscription_events_user_id_created_at_idx
  ON public.subscription_events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS subscription_events_event_type_idx
  ON public.subscription_events (event_type);

COMMENT ON TABLE public.subscription_events IS
  'Append-only ledger of subscription actions (plan/pause/skip/cancel/payment method/admin). Payment failures live elsewhere.';

COMMENT ON COLUMN public.subscription_events.event_data IS
  'Optional JSON, typically { "previous_data": {...}, "new_data": {...} }.';

COMMENT ON COLUMN public.subscription_events.reason IS
  'Optional human reason (especially admin_override or free-form notes).';

ALTER TABLE public.subscription_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own subscription events" ON public.subscription_events;
CREATE POLICY "Users can view own subscription events"
  ON public.subscription_events
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins can view all subscription events" ON public.subscription_events;
CREATE POLICY "Admins can view all subscription events"
  ON public.subscription_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- No direct INSERT/UPDATE/DELETE for clients; use SECURITY DEFINER helpers.

-- Internal writer (callable from other SECURITY DEFINER functions)
CREATE OR REPLACE FUNCTION public.record_subscription_event(
  p_subscription_id uuid,
  p_user_id uuid,
  p_event_type text,
  p_event_data jsonb DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_delivery_id uuid DEFAULT NULL,
  p_actor_id uuid DEFAULT NULL,
  p_actor_role text DEFAULT 'subscriber'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_subscription_id IS NULL OR p_user_id IS NULL OR p_event_type IS NULL THEN
    RAISE EXCEPTION 'subscription_id, user_id, and event_type are required';
  END IF;

  INSERT INTO public.subscription_events (
    subscription_id,
    user_id,
    event_type,
    event_data,
    reason,
    delivery_id,
    actor_id,
    actor_role
  ) VALUES (
    p_subscription_id,
    p_user_id,
    p_event_type,
    p_event_data,
    NULLIF(trim(COALESCE(p_reason, '')), ''),
    p_delivery_id,
    COALESCE(p_actor_id, auth.uid()),
    COALESCE(NULLIF(trim(COALESCE(p_actor_role, '')), ''), 'subscriber')
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_subscription_event(uuid, uuid, text, jsonb, text, uuid, uuid, text) FROM PUBLIC;

-- Subscriber/admin RPC to log an event for their own sub (or any sub if admin)
CREATE OR REPLACE FUNCTION public.log_my_subscription_event(
  p_subscription_id uuid,
  p_event_type text,
  p_event_data jsonb DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_delivery_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub public.subscriptions%ROWTYPE;
  v_is_admin boolean;
  v_actor_role text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT *
  INTO v_sub
  FROM public.subscriptions s
  WHERE s.id = p_subscription_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Subscription not found';
  END IF;

  v_is_admin := EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
  );

  IF v_sub.user_id IS DISTINCT FROM auth.uid() AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  IF p_event_type = 'admin_override' AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  IF p_event_type = 'admin_override' AND (p_reason IS NULL OR length(trim(p_reason)) = 0) THEN
    RAISE EXCEPTION 'reason is required for admin_override';
  END IF;

  v_actor_role := CASE WHEN v_is_admin AND v_sub.user_id IS DISTINCT FROM auth.uid()
    THEN 'admin'
    WHEN v_is_admin AND p_event_type = 'admin_override'
    THEN 'admin'
    ELSE 'subscriber'
  END;

  RETURN public.record_subscription_event(
    p_subscription_id,
    v_sub.user_id,
    p_event_type,
    p_event_data,
    p_reason,
    p_delivery_id,
    auth.uid(),
    v_actor_role
  );
END;
$$;

REVOKE ALL ON FUNCTION public.log_my_subscription_event(uuid, text, jsonb, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_my_subscription_event(uuid, text, jsonb, text, uuid) TO authenticated;

COMMENT ON FUNCTION public.log_my_subscription_event(uuid, text, jsonb, text, uuid) IS
  'Log a subscription ledger event for the caller’s subscription (or any sub if admin).';

-- ---------------------------------------------------------------------------
-- Hook pause / resume
-- ---------------------------------------------------------------------------
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
  v_prev_status text;
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

  v_prev_status := v_sub.status::text;
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

  PERFORM public.record_subscription_event(
    v_sub.id,
    v_sub.user_id,
    CASE WHEN p_paused THEN 'paused' ELSE 'resumed' END,
    jsonb_build_object(
      'previous_data', jsonb_build_object('status', v_prev_status),
      'new_data', jsonb_build_object('status', v_new_sub_status::text)
    ),
    NULL,
    NULL,
    auth.uid(),
    'subscriber'
  );

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

-- ---------------------------------------------------------------------------
-- Hook skip / unskip (keep next_delivery_date behavior from 20260807h)
-- ---------------------------------------------------------------------------
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
  v_nxt_start date := p_week_end + 1;
  v_nxt_end date := p_week_end + 7;
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

  PERFORM public.record_subscription_event(
    v_sub.id,
    v_sub.user_id,
    'skipped',
    jsonb_build_object(
      'previous_data', jsonb_build_object(
        'delivery_status', 'open',
        'scheduled_date', v_del.scheduled_date,
        'next_delivery_date', v_sub.next_delivery_date
      ),
      'new_data', jsonb_build_object(
        'delivery_status', 'skipped',
        'scheduled_date', v_del.scheduled_date,
        'next_delivery_date', v_next.scheduled_date
      )
    ),
    NULL,
    v_del.id,
    auth.uid(),
    'subscriber'
  );

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

  UPDATE public.subscriptions
  SET next_delivery_date = v_del.scheduled_date,
      updated_at = timezone('utc'::text, now())
  WHERE id = v_sub.id;

  PERFORM public.record_subscription_event(
    v_sub.id,
    v_sub.user_id,
    'unskipped',
    jsonb_build_object(
      'previous_data', jsonb_build_object(
        'delivery_status', 'skipped',
        'scheduled_date', v_del.scheduled_date,
        'next_delivery_date', v_sub.next_delivery_date
      ),
      'new_data', jsonb_build_object(
        'delivery_status', 'open',
        'scheduled_date', v_del.scheduled_date,
        'next_delivery_date', v_del.scheduled_date
      )
    ),
    NULL,
    v_del.id,
    auth.uid(),
    'subscriber'
  );

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

NOTIFY pgrst, 'reload schema';
