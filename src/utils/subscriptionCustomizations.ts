/** Shape stored in subscriptions.customizations JSONB and in Auth user.subscription.customizations */
export type SubscriptionCustomizationsState = {
  excludedVegetables: string[];
  removedVegetables: string[];
  addedVegetables: string[];
  deliveryDay: string;
};

const EMPTY: SubscriptionCustomizationsState = {
  excludedVegetables: [],
  removedVegetables: [],
  addedVegetables: [],
  deliveryDay: 'sunday',
};

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

/** Normalize DB or API JSON into a consistent client shape */
export function normalizeSubscriptionCustomizations(raw: unknown): SubscriptionCustomizationsState {
  if (raw == null || typeof raw !== 'object') return { ...EMPTY };
  const o = raw as Record<string, unknown>;
  return {
    excludedVegetables: asStringArray(o.excludedVegetables),
    removedVegetables: asStringArray(o.removedVegetables),
    addedVegetables: asStringArray(o.addedVegetables),
    deliveryDay: typeof o.deliveryDay === 'string' && o.deliveryDay ? o.deliveryDay : EMPTY.deliveryDay,
  };
}
