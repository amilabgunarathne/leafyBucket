import type { PaymentMethod } from '../services/SubscriptionService';

export type BillingPlanCode = 'weekly' | 'monthly' | 'one_time';

export interface SubscriptionPlanRow {
  id: string;
  code: BillingPlanCode | string;
  name: string;
  description: string | null;
  entitled_deliveries: number;
  prepaid_discount_pct?: number;
  prepaid_discount_fixed?: number;
  sort_order?: number;
  is_active?: boolean;
}

export interface ChargeBreakdown {
  list_price: number;
  handling_fee: number;
  plan_discount_pct: number;
  plan_discount_fixed: number;
  plan_discount_amount: number;
  payment_discount_pct: number;
  payment_discount_fixed: number;
  payment_discount_amount: number;
  discount_total: number;
  charge_amount: number;
}

/** Weeks covered by `bucket_types.monthly_price` (the catalog pack). */
export const DEFAULT_PACK_WEEKS = 4;

/**
 * Entitlement comes from the billing plan only (not payment method).
 */
export function getEffectiveEntitledDeliveries(input: {
  payment_method?: Pick<PaymentMethod, 'code'> | null;
  subscription_plan?: { code?: string; entitled_deliveries?: number } | null;
}): number {
  const planEntitled = input.subscription_plan?.entitled_deliveries;
  return Math.max(planEntitled ?? DEFAULT_PACK_WEEKS, 1);
}

export function getWeeklyUnitPrice(
  packPrice: number,
  packWeeks: number = DEFAULT_PACK_WEEKS
): number {
  const weeks = Math.max(Number(packWeeks) || DEFAULT_PACK_WEEKS, 1);
  return Math.round((Math.max(Number(packPrice) || 0, 0) / weeks) * 100) / 100;
}

/** Per-delivery veg budget — always pack ÷ pack weeks, not plan entitlement. */
export function getWeeklyVegetableBudget(
  packPrice: number,
  handlingFee: number,
  packWeeks: number = DEFAULT_PACK_WEEKS
): number {
  const weeks = Math.max(Number(packWeeks) || DEFAULT_PACK_WEEKS, 1);
  return (
    (Math.max(Number(packPrice) || 0, 0) - Math.max(Number(handlingFee) || 0, 0)) / weeks
  );
}

/**
 * List price for one billing period.
 * - monthly → full pack (`monthly_price`)
 * - weekly / one_time → one week unit (`monthly_price / packWeeks`)
 */
export function getPlanBillingListPrice(input: {
  packPrice: number;
  planCode?: string | null;
  packWeeks?: number;
}): number {
  const pack = Math.max(Number(input.packPrice) || 0, 0);
  const weeks = Math.max(Number(input.packWeeks) || DEFAULT_PACK_WEEKS, 1);
  const code = String(input.planCode || 'monthly');
  if (code === 'monthly') return pack;
  return getWeeklyUnitPrice(pack, weeks);
}

export function billingPeriodLabel(code?: string | null): string {
  switch (code) {
    case 'weekly':
      return 'Weekly';
    case 'one_time':
      return 'One-time';
    case 'monthly':
      return 'Monthly';
    default:
      return code ? String(code).replace(/_/g, ' ') : 'Billing';
  }
}

/**
 * Customer-facing payment labels.
 * DB codes: `cash`, `card` (legacy: cash_on_delivery, recurring).
 */
export function formatPaymentMethodLabel(pm: Pick<PaymentMethod, 'code' | 'name'> | null | undefined): string {
  if (!pm) return '';
  switch (pm.code) {
    case 'cash':
    case 'cash_on_delivery':
      return 'Cash';
    case 'card':
    case 'recurring':
      return 'Card';
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

/** Stack: plan discount first, then payment discount on the remainder. */
export function computeSubscriptionCharge(input: {
  listPrice: number;
  handlingFee?: number;
  plan?: Pick<SubscriptionPlanRow, 'prepaid_discount_pct' | 'prepaid_discount_fixed'> | null;
  payment?: Pick<PaymentMethod, 'discount_pct' | 'discount_fixed'> | null;
}): ChargeBreakdown {
  const list = Math.max(Number(input.listPrice) || 0, 0);
  const handling = Math.max(Number(input.handlingFee) || 0, 0);
  const planPct = Math.max(Number(input.plan?.prepaid_discount_pct) || 0, 0);
  const planFixed = Math.max(Number(input.plan?.prepaid_discount_fixed) || 0, 0);
  const payPct = Math.max(Number(input.payment?.discount_pct) || 0, 0);
  const payFixed = Math.max(Number(input.payment?.discount_fixed) || 0, 0);

  let planDisc = Math.round((list * (planPct / 100) + planFixed) * 100) / 100;
  if (planDisc > list) planDisc = list;
  const afterPlan = list - planDisc;

  let payDisc = Math.round((afterPlan * (payPct / 100) + payFixed) * 100) / 100;
  if (payDisc > afterPlan) payDisc = afterPlan;

  const discountTotal = Math.round((planDisc + payDisc) * 100) / 100;
  const charge = Math.max(Math.round((list - discountTotal) * 100) / 100, 0);

  return {
    list_price: list,
    handling_fee: handling,
    plan_discount_pct: planPct,
    plan_discount_fixed: planFixed,
    plan_discount_amount: planDisc,
    payment_discount_pct: payPct,
    payment_discount_fixed: payFixed,
    payment_discount_amount: payDisc,
    discount_total: discountTotal,
    charge_amount: charge,
  };
}

export function formatLkr(amount: number): string {
  return `LKR ${Math.round(amount).toLocaleString()}`;
}
