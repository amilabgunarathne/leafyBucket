-- Weekly plan: 12 prepaid deliveries (≈12 weeks), then renew like monthly's 4-week cycle.

UPDATE public.subscription_plans
SET
  entitled_deliveries = 12,
  description = '12 deliveries (weekly) — renew every 12 weeks',
  updated_at = timezone('utc'::text, now())
WHERE code = 'weekly';

COMMENT ON COLUMN public.subscription_plans.entitled_deliveries IS
  'Prepaid delivery count for this plan cycle: monthly=4, weekly=12, one_time=1. Ensure stops when deliveries_used reaches this until renew.';

NOTIFY pgrst, 'reload schema';
