-- Slim delivery_items to ops fields only: delivery, vegetable, weight, timestamps.
-- Keep is_substituted (populated by materialize — true for customer-added non-default veg).

ALTER TABLE public.delivery_items
  DROP COLUMN IF EXISTS allocated_budget,
  DROP COLUMN IF EXISTS planned_quantity,
  DROP COLUMN IF EXISTS actual_quantity,
  DROP COLUMN IF EXISTS category_id;

ALTER TABLE public.delivery_items
  ADD COLUMN IF NOT EXISTS is_substituted boolean NOT NULL DEFAULT false;

COMMENT ON TABLE public.delivery_items IS
  'Final veg list per delivery for packing/procurement (delivery_id, vegetable_id, weight, is_substituted). Materialize via materialize_delivery_items_for_week.';

COMMENT ON COLUMN public.delivery_items.is_substituted IS
  'True when the line is a customer customization (added veg not in admin weekly defaults). False for admin default picks.';
