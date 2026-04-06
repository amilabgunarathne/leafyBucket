/** Shape stored in subscriptions.customizations JSONB and in Auth user.subscription.customizations */
export type SubscriptionCustomizationsState = {
  excludedVegetables: string[];
  removedVegetables: string[];
  addedVegetables: string[];
  deliveryDay: string;
  /** market_weeks.id for the week these lists apply to; if missing or ≠ current week, adds/removes are ignored */
  marketWeekId?: string | null;
};

const EMPTY: SubscriptionCustomizationsState = {
  excludedVegetables: [],
  removedVegetables: [],
  addedVegetables: [],
  deliveryDay: 'sunday',
  marketWeekId: null,
};

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

/** Normalize DB or API JSON into a consistent client shape */
export function normalizeSubscriptionCustomizations(raw: unknown): SubscriptionCustomizationsState {
  if (raw == null || typeof raw !== 'object') return { ...EMPTY };
  const o = raw as Record<string, unknown>;
  const mw = o.marketWeekId;
  return {
    excludedVegetables: asStringArray(o.excludedVegetables),
    removedVegetables: asStringArray(o.removedVegetables),
    addedVegetables: asStringArray(o.addedVegetables),
    deliveryDay: typeof o.deliveryDay === 'string' && o.deliveryDay ? o.deliveryDay : EMPTY.deliveryDay,
    marketWeekId: typeof mw === 'string' && mw.length > 0 ? mw : mw === null ? null : undefined,
  };
}

/** True when saved veg lists were stored for this market week (same market_weeks.id as admin “veg for week”). */
export function vegCustomizationAppliesToCurrentWeek(
  customizations: SubscriptionCustomizationsState,
  currentMarketWeekId: string | null | undefined
): boolean {
  const saved = customizations.marketWeekId;
  if (!saved || typeof saved !== 'string') return false;
  if (!currentMarketWeekId) return false;
  return saved === currentMarketWeekId;
}

/**
 * Per-week add/remove/exclude lists only apply when marketWeekId matches the active admin week.
 * Otherwise show admin defaults only (previous week’s “ADDED” items must not carry over).
 */
export function effectiveVegCustomizations(
  customizations: SubscriptionCustomizationsState,
  currentMarketWeekId: string | null | undefined
): Pick<SubscriptionCustomizationsState, 'excludedVegetables' | 'removedVegetables' | 'addedVegetables'> {
  if (!vegCustomizationAppliesToCurrentWeek(customizations, currentMarketWeekId)) {
    return { excludedVegetables: [], removedVegetables: [], addedVegetables: [] };
  }
  return {
    excludedVegetables: [...customizations.excludedVegetables],
    removedVegetables: [...customizations.removedVegetables],
    addedVegetables: [...customizations.addedVegetables],
  };
}

/**
 * My Bucket progress: “Customization” ticks only if the customer saved preferences for this market week
 * and changed the bucket (add/remove/exclude). Saving with no changes does not tick.
 */
export function hasSavedVegCustomizationForCurrentWeek(
  customizations: SubscriptionCustomizationsState,
  currentMarketWeekId: string | null | undefined
): boolean {
  if (!vegCustomizationAppliesToCurrentWeek(customizations, currentMarketWeekId)) return false;
  return (
    customizations.removedVegetables.length > 0 ||
    customizations.addedVegetables.length > 0 ||
    customizations.excludedVegetables.length > 0
  );
}
