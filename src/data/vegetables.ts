// Vegetble categorization and pricing system
// Categories with value ratios: Root/Tuber (4) : Leafy (2) : Bushy/Fruit (3)

import PricingService from '../services/pricingService';
import VegetableService from '../services/vegetableService';

export interface Vegetable {
  id: string;
  name: string;
  category: 'root' | 'leafy' | 'bushy';
  baseValue: number; // Base value points for subscription pricing calculation
  typicalWeight: string;
  marketPricePer250g: number; // Default market price per 250g (can be overridden by pricing service)
  description: string;
  season: string;
  benefits: string[];
  image: string;
  // Weight per value point for dynamic allocation
  weightPerValuePoint: number; // grams per value point
}

// Base value ratios: Root=4, Leafy=2, Bushy=3 (for subscription allocation only)
export const CATEGORY_VALUES = {
  root: 4,   // Heavy vegetables that grow underground (carrots, potatoes, radish)
  leafy: 2,  // Light leafy greens (gotukola, mukunuwenna, kankun)
  bushy: 3   // Medium weight vegetables that grow on bushes/vines (eggplant, okra, beans)
};

// Average weight per value point for each category (grams per value point)
export const CATEGORY_WEIGHT_RATIOS = {
  root: 125,  // Root vegetables: ~125g per value point (500g ÷ 4 = 125g)
  leafy: 125, // Leafy vegetables: ~125g per value point (250g ÷ 2 = 125g)
  bushy: 100  // Bushy vegetables: ~100g per value point (300g ÷ 3 = 100g)
};

export const vegetables: Vegetable[] = []; // Deprecated: Use VegetableService instead

// Function to calculate vegetable value allocation for subscription plans (uses 4:2:3 ratio)
export const calculatePlanAllocation = (totalBudget: number, selectedVegetables: string[], availableVegetables: Vegetable[]) => {
  const selectedVegData = availableVegetables.filter(v => selectedVegetables.includes(v.id));
  const totalValue = selectedVegData.reduce((sum, veg) => sum + veg.baseValue, 0);

  if (totalValue === 0) return [];

  return selectedVegData.map(veg => {
    const allocatedBudget = Math.round((veg.baseValue / totalValue) * totalBudget);
    const allocatedWeight = Math.round(veg.weightPerValuePoint * veg.baseValue);

    return {
      ...veg,
      allocatedBudget,
      allocatedWeight, // Dynamic weight based on value allocation
      valuePercentage: Math.round((veg.baseValue / totalValue) * 100)
    };
  });
};

// Function to calculate total weight for a plan
export const calculateTotalPlanWeight = (selectedVegetables: string[], availableVegetables: Vegetable[]) => {
  const allocation = calculatePlanAllocation(1000, selectedVegetables, availableVegetables); // Use dummy budget for weight calculation
  return allocation.reduce((total, veg) => total + veg.allocatedWeight, 0);
};

// Function to get weight breakdown by category
export const getWeightBreakdownByCategory = (selectedVegetables: string[], availableVegetables: Vegetable[]) => {
  const allocation = calculatePlanAllocation(1000, selectedVegetables, availableVegetables); // Use dummy budget

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
  medium: ['carrots', 'radish', 'gotukola', 'mukunuwenna', 'bandakka', 'wambatu', 'chilies'], // 2 root + 2 leafy + 3 bushy
  large: ['carrots', 'radish', 'sweetpotato', 'gotukola', 'mukunuwenna', 'kankun', 'bandakka', 'wambatu', 'karavila', 'beans'] // 3 root + 3 leafy + 4 bushy
};

// Function to get current price for a vegetable (used throughout the app)
export const getCurrentPrice = (vegetableId: string): number => {
  const pricingService = PricingService.getInstance();
  const vegetableService = VegetableService.getInstance();
  const vegetable = vegetableService.getVegetable(vegetableId);
  return pricingService.getPrice(vegetableId) || vegetable?.marketPricePer250g || 0;
};