-- Payment methods: admin-managed list (e.g. Cash on Delivery, Recurring). Customers choose one per subscription.

-- =============================================================================
-- 1. PAYMENT_METHODS table
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.payment_methods (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS: everyone can read enabled methods; only admins can manage
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read enabled payment methods"
  ON public.payment_methods FOR SELECT
  USING (is_enabled = true);

CREATE POLICY "Admins can manage payment methods"
  ON public.payment_methods FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- =============================================================================
-- 2. SUBSCRIPTIONS: add payment_method_id (nullable; set when customer completes payment setup)
-- =============================================================================
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS payment_method_id UUID REFERENCES public.payment_methods(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.subscriptions.payment_method_id IS 'Customer-chosen payment method; set when they complete payment setup.';

-- =============================================================================
-- 3. Seed default payment methods
-- =============================================================================
INSERT INTO public.payment_methods (code, name, description, sort_order, is_enabled)
VALUES
  ('cash_on_delivery', 'Cash on Delivery', 'Pay when you receive your vegetables', 1, true),
  ('recurring', 'Recurring payment', 'Automatically charge your card each month', 2, true)
ON CONFLICT (code) DO NOTHING;
