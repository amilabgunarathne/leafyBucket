-- Persist per-subscription bucket customizations (removed/added veg, delivery day, etc.)
-- so they survive full page reload; AuthContext reads this JSON into user.subscription.customizations.

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS customizations JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.subscriptions.customizations IS
  'Customer bucket UI state: excludedVegetables, removedVegetables, addedVegetables, deliveryDay.';
