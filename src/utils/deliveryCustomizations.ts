/** Shape stored in `deliveries.customizations` JSONB (and mirrored on Auth `user.subscription` for the current open delivery). */

export type DeliveryCustomizationsState = {
  excludedVegetables: string[];
  removedVegetables: string[];
  addedVegetables: string[];
  deliveryDay: string;
};

const EMPTY: DeliveryCustomizationsState = {
  excludedVegetables: [],
  removedVegetables: [],
  addedVegetables: [],
  deliveryDay: 'sunday',
};

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

/** Normalize DB JSON into a consistent client shape (ignores legacy `marketWeekId`). */
export function normalizeDeliveryCustomizations(raw: unknown): DeliveryCustomizationsState {
  if (raw == null || typeof raw !== 'object') return { ...EMPTY };
  const o = raw as Record<string, unknown>;
  return {
    excludedVegetables: asStringArray(o.excludedVegetables),
    removedVegetables: asStringArray(o.removedVegetables),
    addedVegetables: asStringArray(o.addedVegetables),
    deliveryDay: typeof o.deliveryDay === 'string' && o.deliveryDay ? o.deliveryDay : EMPTY.deliveryDay,
  };
}

/** Payload for RPC / DB: no week id — row is already scoped to one delivery. */
export function deliveryCustomizationsToJson(state: DeliveryCustomizationsState): Record<string, unknown> {
  return {
    excludedVegetables: state.excludedVegetables,
    removedVegetables: state.removedVegetables,
    addedVegetables: state.addedVegetables,
    deliveryDay: state.deliveryDay,
  };
}

/** My Bucket: customer saved veg deltas for this delivery. */
export function hasSavedVegCustomization(c: DeliveryCustomizationsState): boolean {
  return (
    c.removedVegetables.length > 0 ||
    c.addedVegetables.length > 0 ||
    c.excludedVegetables.length > 0
  );
}
