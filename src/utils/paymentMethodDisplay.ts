import type { PaymentMethod } from '../services/SubscriptionService';

/**
 * Customer-facing labels (not necessarily the same as DB `name`).
 * DB seeds: `cash_on_delivery`, `recurring`.
 */
export function formatPaymentMethodLabel(pm: Pick<PaymentMethod, 'code' | 'name'> | null | undefined): string {
  if (!pm) return '';
  switch (pm.code) {
    case 'cash_on_delivery':
      return 'Cash on delivery';
    case 'recurring':
      return 'Card recurring';
    default:
      return pm.name?.trim() || '';
  }
}

export function normalizePaymentMethodJoin(
  raw: PaymentMethod | PaymentMethod[] | null | undefined
): PaymentMethod | null {
  if (raw == null) return null;
  return Array.isArray(raw) ? raw[0] ?? null : raw;
}

/**
 * Entitlement cycle length for Delivery #X of N:
 * - one_time → 1
 * - cash_on_delivery or recurring → 12
 * - else plan.entitled_deliveries (monthly prepaid → 4)
 */
export function getEffectiveEntitledDeliveries(input: {
  payment_method?: Pick<PaymentMethod, 'code'> | null;
  subscription_plan?: { code?: string; entitled_deliveries?: number } | null;
}): number {
  const planCode = input.subscription_plan?.code;
  const planEntitled = input.subscription_plan?.entitled_deliveries;
  if (planCode === 'one_time') return Math.max(planEntitled ?? 1, 1);

  const pmCode = input.payment_method?.code;
  if (pmCode === 'cash_on_delivery' || pmCode === 'recurring') return 12;

  return Math.max(planEntitled ?? 4, 1);
}
