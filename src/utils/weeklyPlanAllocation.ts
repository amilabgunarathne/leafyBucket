import SubscriptionService from '../services/SubscriptionService';
import type { Vegetable as DataVegetable } from '../data/vegetables';
import { calculatePlanAllocation } from '../data/vegetables';
import type { Vegetable as CatalogVegetable } from '../services/vegetableService';

const CATEGORICAL_FALLBACKS: Record<'small' | 'medium' | 'large', { root: number; bushy: number; leafy: number }> = {
  small: { root: 1, bushy: 2, leafy: 1 },
  medium: { root: 2, bushy: 3, leafy: 2 },
  large: { root: 3, bushy: 4, leafy: 3 },
};

function mapBucketTypeToPlanKey(bt: { name: string }): 'small' | 'medium' | 'large' | null {
  const n = bt.name.toLowerCase();
  if (n === 'mini' || n === 'small') return 'small';
  if (n === 'family' || n === 'medium') return 'medium';
  if (n === 'plus' || n === 'large') return 'large';
  return null;
}

function toDataVegetables(catalog: CatalogVegetable[]): DataVegetable[] {
  return catalog.map((v) => ({
    id: v.id,
    name: v.name,
    category: v.category,
    typicalWeight: v.typicalWeight,
    marketPricePer250g: v.marketPricePer250g,
    description: v.description,
    season: v.season,
    benefits: v.benefits,
    image: v.image,
  }));
}

/**
 * Same budget/weight math as Customize (`calculatePlanAllocation`): weekly veg budget, category shares
 * from bucket_types, bulk prices from vegetables. Use for My Bucket so weights match Customize.
 */
export async function getWeeklyAllocationsByVegetableId(
  planKey: 'small' | 'medium' | 'large',
  selectedVegetableIds: string[],
  catalogVegetables: CatalogVegetable[]
): Promise<Map<string, { allocatedWeight: number; allocatedBudget: number }>> {
  const out = new Map<string, { allocatedWeight: number; allocatedBudget: number }>();
  const bucketTypes = await SubscriptionService.getInstance().getBucketTypes();
  const bt = bucketTypes.find((b) => mapBucketTypeToPlanKey(b) === planKey);
  if (!bt) return out;

  const vegetableBudget = (bt.monthly_price - bt.handling_fee) / 4;
  const fb = CATEGORICAL_FALLBACKS[planKey];
  const categoricalLimits = {
    root: bt.root_count || fb.root,
    leafy: bt.leafy_count || fb.leafy,
    bushy: bt.bushy_count || fb.bushy,
  };

  const rPct = bt.root_budget_pct != null ? Math.max(0, Math.min(100, bt.root_budget_pct)) : 34;
  const lPct = bt.leafy_budget_pct != null ? Math.max(0, Math.min(100, bt.leafy_budget_pct)) : 33;
  const bPct = bt.bushy_budget_pct != null ? Math.max(0, Math.min(100, bt.bushy_budget_pct)) : 33;
  const sum = rPct + lPct + bPct;
  const categoryRatios = sum >= 20 ? { root: rPct, leafy: lPct, bushy: bPct } : { root: 34, leafy: 33, bushy: 33 };

  const available = toDataVegetables(catalogVegetables);
  const allocation = calculatePlanAllocation(
    vegetableBudget,
    selectedVegetableIds,
    available,
    categoricalLimits,
    bt.id,
    categoryRatios
  );

  allocation.forEach((row) => {
    out.set(row.id, { allocatedWeight: row.allocatedWeight, allocatedBudget: row.allocatedBudget });
  });
  return out;
}
