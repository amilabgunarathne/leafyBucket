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
