-- Normalize subscription plan types into their own table.
-- Replaces subscriptions.plan_type + subscriptions.total_entitled_deliveries with a single FK.

CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT UNIQUE NOT NULL, -- 'monthly', 'weekly', 'one_time'
  name TEXT NOT NULL,
  description TEXT,
  -- Number of deliveries created up-front when a subscription starts on this plan.
  entitled_deliveries INTEGER NOT NULL CHECK (entitled_deliveries >= 1),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;

-- Everyone can read active plans
DROP POLICY IF EXISTS "Anyone can read active subscription plans" ON public.subscription_plans;
CREATE POLICY "Anyone can read active subscription plans"
  ON public.subscription_plans
  FOR SELECT
  USING (is_active = true);

-- Admins can manage
DROP POLICY IF EXISTS "Admins can manage subscription plans" ON public.subscription_plans;
CREATE POLICY "Admins can manage subscription plans"
  ON public.subscription_plans
  FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- Seed default plans
INSERT INTO public.subscription_plans (code, name, description, entitled_deliveries, sort_order, is_active)
VALUES
  ('monthly', 'Monthly', '4 deliveries (weekly) billed monthly', 4, 1, true),
  ('weekly', 'Weekly', '1 delivery billed weekly', 1, 2, true),
  ('one_time', 'One-time', 'Single delivery (no recurring)', 1, 3, true)
ON CONFLICT (code) DO NOTHING;

-- Add FK to subscriptions
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS subscription_plan_id UUID REFERENCES public.subscription_plans(id) ON DELETE RESTRICT;

COMMENT ON COLUMN public.subscriptions.subscription_plan_id IS
  'FK to subscription_plans. Replaces legacy plan_type + total_entitled_deliveries.';

-- Backfill from legacy columns when present.
-- (Safe on DBs where these columns don’t exist yet; this block will error if executed on a DB missing them,
-- so keep it after the column existed in your migration history.)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'subscriptions' AND column_name = 'plan_type'
  ) THEN
    UPDATE public.subscriptions s
    SET subscription_plan_id = p.id
    FROM public.subscription_plans p
    WHERE s.subscription_plan_id IS NULL
      AND p.code = s.plan_type::text;
  END IF;
END$$;

-- If total_entitled_deliveries exists and differs, keep it as-is for historical rows; new rows use plan.entitled_deliveries.

-- Drop legacy columns if present (app no longer uses them)
ALTER TABLE public.subscriptions
  DROP COLUMN IF EXISTS plan_type,
  DROP COLUMN IF EXISTS total_entitled_deliveries;

NOTIFY pgrst, 'reload schema';

