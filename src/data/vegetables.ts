// Vegetble categorization and pricing system
// Categories with value ratios: Root/Tuber (4) : Leafy (2) : Bushy/Fruit (3)

import PricingService from '../services/pricingService';
import VegetableService from '../services/vegetableService';

export interface Vegetable {
  id: string;
  name: string;
  category: 'root' | 'leafy' | 'bushy';
  typicalWeight: string;
  marketPricePer250g: number; // Default market price per 250g
  description: string;
  season: string;
  benefits: string[];
  image: string;
}

// Budget share percentages (from veg_categories.budget_share_percent), fallback below
export const CATEGORY_RATIOS_FALLBACK = { root: 44, leafy: 22, bushy: 34 };

export const vegetables: Vegetable[] = []; // Deprecated: Use VegetableService instead

// Plan structures: (Root, Bushy, Leafy) counts
const PLAN_STRUCTURES: Record<number, { root: number, bushy: number, leafy: number }> = {
  2400: { root: 1, bushy: 2, leafy: 1 }, // Small (4)
  4300: { root: 2, bushy: 3, leafy: 2 }, // Medium (7)
  6200: { root: 3, bushy: 4, leafy: 3 }  // Large (10)
};

/** Target counts per category for the plan (e.g. small: 1 root, 1 leafy, 2 bushy). Used for budget denominator. */
export type CategoricalLimits = { root: number; leafy: number; bushy: number };

/** Budget share per category as percentages 0–100 (e.g. from bucket_type_category_ratios). */
export type CategoryRatios = { root: number; leafy: number; bushy: number };

// Function to calculate vegetable allocation for subscription plans
// Splits the total budget by category percentages; denominator uses plan's target count per category
export const calculatePlanAllocation = (
  totalBudget: number,
  selectedVegetables: string[],
  availableVegetables: Vegetable[],
  categoricalLimits?: CategoricalLimits,
  bucketTypeId?: string,
  categoryRatiosOverride?: CategoryRatios
) => {
  const selectedVegData = availableVegetables.filter(v => selectedVegetables.includes(v.id));
  if (selectedVegData.length === 0) return [];

  const ratios = categoryRatiosOverride ?? VegetableService.getInstance().getCategoryRatios(bucketTypeId);
  const totalShare = ratios.root + ratios.leafy + ratios.bushy || 100;
  const structure = categoricalLimits || PLAN_STRUCTURES[totalBudget] || { root: 1, bushy: 1, leafy: 1 };

  return selectedVegData.map(veg => {
    const categoryPct = ratios[veg.category as keyof typeof ratios] ?? CATEGORY_RATIOS_FALLBACK[veg.category as keyof typeof CATEGORY_RATIOS_FALLBACK] ?? 34;
    const itemsInCategory = selectedVegData.filter(v => v.category === veg.category).length;

    const targetCount = structure[veg.category as keyof typeof structure] || 1;
    const denominator = Math.max(itemsInCategory, targetCount);

    // Category pool = (share % / 100) * totalBudget; item share = pool / denominator
    const allocatedBudget = Math.floor(((categoryPct / totalShare) * totalBudget) / denominator);

    const currentPrice = getCurrentPrice(veg.id);
    const allocatedWeight = currentPrice > 0
      ? Math.round((allocatedBudget / currentPrice) * 250)
      : 0;

    return {
      ...veg,
      allocatedBudget,
      allocatedWeight,
      valuePercentage: Math.round((allocatedBudget / totalBudget) * 100)
    };
  });
};

// Function to calculate total weight for a plan
export const calculateTotalPlanWeight = (
  totalBudget: number,
  selectedVegetables: string[],
  availableVegetables: Vegetable[],
  categoricalLimits?: CategoricalLimits,
  bucketTypeId?: string,
  categoryRatiosOverride?: CategoryRatios
) => {
  const allocation = calculatePlanAllocation(totalBudget, selectedVegetables, availableVegetables, categoricalLimits, bucketTypeId, categoryRatiosOverride);
  return allocation.reduce((total, veg) => total + veg.allocatedWeight, 0);
};

// Function to get weight breakdown by category
export const getWeightBreakdownByCategory = (
  totalBudget: number,
  selectedVegetables: string[],
  availableVegetables: Vegetable[],
  categoricalLimits?: CategoricalLimits,
  bucketTypeId?: string,
  categoryRatiosOverride?: CategoryRatios
) => {
  const allocation = calculatePlanAllocation(totalBudget, selectedVegetables, availableVegetables, categoricalLimits, bucketTypeId, categoryRatiosOverride);

  const breakdown = {
    root: { count: 0, weight: 0 },
    leafy: { count: 0, weight: 0 },
    bushy: { count: 0, weight: 0 }
  };

  allocation.forEach(veg => {
    if (veg.category && breakdown[veg.category]) {
      breakdown[veg.category].count++;
      breakdown[veg.category].weight += veg.allocatedWeight;
    }
  });

  const totalWeight = Object.values(breakdown).reduce((sum, cat) => sum + cat.weight, 0);

  return {
    breakdown,
    totalWeight,
    percentages: {
      root: totalWeight > 0 ? Math.round((breakdown.root.weight / totalWeight) * 100) : 0,
      leafy: totalWeight > 0 ? Math.round((breakdown.leafy.weight / totalWeight) * 100) : 0,
      bushy: totalWeight > 0 ? Math.round((breakdown.bushy.weight / totalWeight) * 100) : 0
    }
  };
};

// Default vegetable selections for each plan (balanced across categories)
export const defaultPlanVegetables = {
  small: ['carrots', 'gotukola', 'bandakka', 'chilies'], // 1 root + 1 leafy + 2 bushy
  medium: ['carrots', 'radish', 'gotukola', 'nivithi', 'bandakka', 'wambatu', 'chilies'], // 2 root + 2 leafy + 3 bushy
  large: ['carrots', 'radish', 'sweetpotato', 'gotukola', 'mukunuwenna', 'nivithi', 'bandakka', 'wambatu', 'karavila', 'beans'] // 3 root + 3 leafy + 4 bushy
};

// Function to get current price for a vegetable (used throughout the app)
export const getCurrentPrice = (vegetableId: string): number => {
  const pricingService = PricingService.getInstance();
  const vegetableService = VegetableService.getInstance();
  const vegetable = vegetableService.getVegetable(vegetableId);
  return pricingService.getPrice(vegetableId) || vegetable?.marketPricePer250g || 0;
};