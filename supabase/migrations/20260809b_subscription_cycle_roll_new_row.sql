-- Cycle end → complete current subscription and start a new one (fresh price snapshot).
-- Replaces "reset deliveries_used on same row" from 20260808c.
-- Prerequisite: run 20260809a_subscription_status_completed.sql first (separate statement/commit).

-- 1) Allow multiple subscription rows per user (history + new cycle)
DO $$
DECLARE
  cname text;
BEGIN
  SELECT con.conname INTO cname
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE nsp.nspname = 'public'
    AND rel.relname = 'subscriptions'
    AND con.contype = 'u'
    AND pg_get_constraintdef(con.oid) ILIKE '%(user_id)%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.subscriptions DROP CONSTRAINT %I', cname);
  END IF;
END $$;

DROP INDEX IF EXISTS public.subscriptions_user_id_key;
DROP INDEX IF EXISTS public.subscriptions_user_id_unique;

-- 2) Chain + completed_at
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS previous_subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.subscriptions.previous_subscription_id IS
  'Prior cycle subscription this row continues from (null if first).';
COMMENT ON COLUMN public.subscriptions.completed_at IS
  'When status became completed (entitlement cycle finished).';

-- Users may hold multiple active/paused subscriptions (e.g. two homes).
-- Do NOT add a unique (user_id) filter for active/paused.
DROP INDEX IF EXISTS public.subscriptions_one_open_per_user;

-- 3) Events: cycle_completed
ALTER TABLE public.subscription_events DROP CONSTRAINT IF EXISTS subscription_events_event_type_check;
ALTER TABLE public.subscription_events
  ADD CONSTRAINT subscription_events_event_type_check
  CHECK (event_type IN (
    'created',
    'plan_changed',
    'paused',
    'resumed',
    'skipped',
    'unskipped',
    'cancelled',
    'payment_method_changed',
    'admin_override',
    'cycle_completed'
  ));

-- 4) Roll helper: complete old + create new + move remaining open/paused deliveries
CREATE OR REPLACE FUNCTION public.roll_subscription_to_next_cycle(
  p_old_subscription_id uuid,
  p_completed_delivery_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old public.subscriptions%ROWTYPE;
  v_new_id uuid;
  v_entitled integer;
  v_budget numeric;
  v_bt RECORD;
  v_plan_code text;
BEGIN
  SELECT * INTO v_old
  FROM public.subscriptions
  WHERE id = p_old_subscription_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Subscription not found';
  END IF;

  IF v_old.status IS DISTINCT FROM 'active' AND v_old.status IS DISTINCT FROM 'paused' THEN
    SELECT id INTO v_new_id
    FROM public.subscriptions
    WHERE previous_subscription_id = p_old_subscription_id
    ORDER BY created_at DESC NULLS LAST
    LIMIT 1;
    RETURN v_new_id;
  END IF;

  SELECT sp.code INTO v_plan_code
  FROM public.subscription_plans sp
  WHERE sp.id = v_old.subscription_plan_id;

  UPDATE public.subscriptions
  SET status = 'completed'::public.subscription_status_enum,
      completed_at = timezone('utc'::text, now()),
      updated_at = timezone('utc'::text, now())
  WHERE id = v_old.id;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'record_subscription_event') THEN
    PERFORM public.record_subscription_event(
      v_old.id,
      v_old.user_id,
      'cycle_completed',
      jsonb_build_object(
        'previous_data', jsonb_build_object(
          'status', v_old.status::text,
          'deliveries_used', v_old.deliveries_used,
          'bucket_type_id', v_old.bucket_type_id,
          'subscription_plan_id', v_old.subscription_plan_id
        ),
        'new_data', jsonb_build_object('status', 'completed')
      ),
      'Entitlement cycle finished',
      p_completed_delivery_id,
      NULL,
      'system'
    );
  END IF;

  -- one_time: complete only, no auto next cycle
  IF v_plan_code = 'one_time' THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_bt
  FROM public.bucket_types
  WHERE id = v_old.bucket_type_id;

  v_entitled := public.effective_entitled_deliveries(v_old.id);
  IF v_entitled IS NULL OR v_entitled < 1 THEN
    v_entitled := 4;
  END IF;

  IF v_bt.id IS NOT NULL THEN
    v_budget := ROUND(
      ((COALESCE(v_bt.monthly_price, 0) - COALESCE(v_bt.handling_fee, 0))::numeric) / v_entitled,
      2
    );
  ELSE
    v_budget := 0;
  END IF;

  INSERT INTO public.subscriptions (
    user_id,
    bucket_type_id,
    subscription_plan_id,
    payment_method_id,
    status,
    deliveries_used,
    started_at,
    next_delivery_date,
    previous_subscription_id
  ) VALUES (
    v_old.user_id,
    v_old.bucket_type_id,
    v_old.subscription_plan_id,
    v_old.payment_method_id,
    'active'::public.subscription_status_enum,
    0,
    timezone('utc'::text, now()),
    v_old.next_delivery_date,
    v_old.id
  )
  RETURNING id INTO v_new_id;

  -- Move remaining open/paused deliveries to the new subscription (keep customizations)
  UPDATE public.deliveries d
  SET subscription_id = v_new_id,
      delivery_index = 1,
      weekly_budget = COALESCE(v_budget, d.weekly_budget)
  WHERE d.subscription_id = v_old.id
    AND d.status IN ('open', 'paused')
    AND (p_completed_delivery_id IS NULL OR d.id IS DISTINCT FROM p_completed_delivery_id);

  UPDATE public.subscriptions
  SET next_delivery_date = (
        SELECT MIN(d.scheduled_date)
        FROM public.deliveries d
        WHERE d.subscription_id = v_new_id AND d.status = 'open'
      ),
      updated_at = timezone('utc'::text, now())
  WHERE id = v_new_id;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'record_subscription_event') THEN
    PERFORM public.record_subscription_event(
      v_new_id,
      v_old.user_id,
      'created',
      jsonb_build_object(
        'previous_data', jsonb_build_object('previous_subscription_id', v_old.id),
        'new_data', jsonb_build_object(
          'status', 'active',
          'bucket_type_id', v_old.bucket_type_id,
          'subscription_plan_id', v_old.subscription_plan_id,
          'payment_method_id', v_old.payment_method_id,
          'monthly_price', v_bt.monthly_price,
          'handling_fee', v_bt.handling_fee
        )
      ),
      'Auto-started next entitlement cycle',
      NULL,
      NULL,
      'system'
    );
  END IF;

  RETURN v_new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.roll_subscription_to_next_cycle(uuid, uuid) FROM PUBLIC;

-- 5) Deliver trigger: complete cycle → roll (no reset of deliveries_used on same row)
CREATE OR REPLACE FUNCTION public.on_delivery_status_change_update_subscription()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_date date;
  v_used integer;
  v_entitled integer;
  v_new_sub uuid;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'delivered' AND OLD.status IS DISTINCT FROM 'delivered' THEN
    IF NEW.delivered_at IS NULL THEN
      NEW.delivered_at := timezone('utc'::text, now());
    END IF;

    v_entitled := public.effective_entitled_deliveries(NEW.subscription_id);

    UPDATE public.subscriptions
    SET deliveries_used = COALESCE(deliveries_used, 0) + 1,
        updated_at = timezone('utc'::text, now())
    WHERE id = NEW.subscription_id
    RETURNING deliveries_used INTO v_used;

    NEW.delivery_index := LEAST(COALESCE(v_used, 1), v_entitled);

    IF COALESCE(v_used, 0) >= v_entitled THEN
      v_new_sub := public.roll_subscription_to_next_cycle(NEW.subscription_id, NEW.id);
    END IF;
  END IF;

  IF OLD.status = 'delivered' AND NEW.status IS DISTINCT FROM 'delivered' THEN
    UPDATE public.subscriptions
    SET deliveries_used = GREATEST(COALESCE(deliveries_used, 0) - 1, 0),
        updated_at = timezone('utc'::text, now())
    WHERE id = NEW.subscription_id
      AND status IN ('active', 'paused', 'completed');

    IF NEW.delivered_at IS NOT NULL THEN
      NEW.delivered_at := NULL;
    END IF;

    NEW.delivery_index := GREATEST(COALESCE(NEW.delivery_index, 1) - 1, 1);
  END IF;

  SELECT d.scheduled_date
  INTO next_date
  FROM public.deliveries d
  WHERE d.subscription_id = NEW.subscription_id
    AND d.status = 'open'
    AND d.id IS DISTINCT FROM NEW.id
  ORDER BY d.scheduled_date ASC, d.delivery_index ASC
  LIMIT 1;

  IF next_date IS NULL AND NEW.status = 'open' THEN
    next_date := NEW.scheduled_date;
  END IF;

  UPDATE public.subscriptions
  SET next_delivery_date = next_date,
      updated_at = timezone('utc'::text, now())
  WHERE id = NEW.subscription_id
    AND status IN ('active', 'paused');

  IF v_new_sub IS NOT NULL THEN
    UPDATE public.subscriptions s
    SET next_delivery_date = (
          SELECT MIN(d.scheduled_date)
          FROM public.deliveries d
          WHERE d.subscription_id = s.id AND d.status = 'open'
        ),
        updated_at = timezone('utc'::text, now())
    WHERE s.id = v_new_sub;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.on_delivery_status_change_update_subscription() IS
  'On delivered: increment deliveries_used + set delivery_index; when cycle completes, mark sub completed and create next-cycle subscription.';

COMMENT ON FUNCTION public.roll_subscription_to_next_cycle(uuid, uuid) IS
  'Complete entitlement cycle: status=completed, insert new active subscription (current bucket prices), move future open/paused deliveries.';

NOTIFY pgrst, 'reload schema';
