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

export const vegetables: Vegetable[] = [
  // ROOT/TUBER VEGETABLES (Value: 4)
  {
    id: 'carrots',
    name: 'Organic Carrots',
    category: 'root',
    baseValue: 4,
    typicalWeight: '500g',
    weightPerValuePoint: 125, // 500g ÷ 4 = 125g per point
    marketPricePer250g: 110,
    description: 'Sweet, crunchy carrots from Bandarawela farms',
    season: 'Year-round',
    benefits: ['Rich in beta-carotene', 'Good for eye health', 'High fiber'],
    image: 'https://images.pexels.com/photos/143133/pexels-photo-143133.jpeg?auto=compress&cs=tinysrgb&w=400'
  },
  {
    id: 'radish',
    name: 'Radish (Rabu)',
    category: 'root',
    baseValue: 4,
    typicalWeight: '400g',
    weightPerValuePoint: 100, // 400g ÷ 4 = 100g per point
    marketPricePer250g: 80,
    description: 'Crisp white radishes perfect for sambols',
    season: 'Year-round',
    benefits: ['High in vitamin C', 'Good for digestion', 'Low calories'],
    image: 'https://images.pexels.com/photos/1359326/pexels-photo-1359326.jpeg?auto=compress&cs=tinysrgb&w=400'
  },
  {
    id: 'sweetpotato',
    name: 'Sweet Potato',
    category: 'root',
    baseValue: 4,
    typicalWeight: '600g',
    weightPerValuePoint: 150, // 600g ÷ 4 = 150g per point
    marketPricePer250g: 105,
    description: 'Orange sweet potatoes from hill country',
    season: 'Year-round',
    benefits: ['Rich in beta-carotene', 'High fiber', 'Natural sweetness'],
    image: 'https://images.pexels.com/photos/144248/potatoes-vegetables-erdfrucht-bio-144248.jpeg?auto=compress&cs=tinysrgb&w=400'
  },
  {
    id: 'beetroot',
    name: 'Beetroot',
    category: 'root',
    baseValue: 4,
    typicalWeight: '450g',
    weightPerValuePoint: 112, // 450g ÷ 4 = 112g per point
    marketPricePer250g: 100,
    description: 'Deep red beetroots rich in nutrients',
    season: 'Year-round',
    benefits: ['Rich in folate', 'Supports heart health', 'Natural nitrates'],
    image: 'https://images.pexels.com/photos/1359326/pexels-photo-1359326.jpeg?auto=compress&cs=tinysrgb&w=400'
  },

  // LEAFY VEGETABLES (Value: 2)
  {
    id: 'gotukola',
    name: 'Gotukola (Pennywort)',
    category: 'leafy',
    baseValue: 2,
    typicalWeight: '200g',
    weightPerValuePoint: 100, // 200g ÷ 2 = 100g per point
    marketPricePer250g: 190,
    description: 'Traditional leafy green rich in nutrients',
    season: 'Year-round',
    benefits: ['Brain health', 'Anti-inflammatory', 'Rich in antioxidants'],
    image: 'https://images.pexels.com/photos/7129052/pexels-photo-7129052.jpeg?auto=compress&cs=tinysrgb&w=400'
  },
  {
    id: 'mukunuwenna',
    name: 'Mukunuwenna',
    category: 'leafy',
    baseValue: 2,
    typicalWeight: '200g',
    weightPerValuePoint: 100, // 200g ÷ 2 = 100g per point
    marketPricePer250g: 150,
    description: 'Nutritious local greens for curries',
    season: 'Year-round',
    benefits: ['High in iron', 'Rich in vitamins', 'Traditional medicine'],
    image: 'https://images.pexels.com/photos/2325843/pexels-photo-2325843.jpeg?auto=compress&cs=tinysrgb&w=400'
  },
  {
    id: 'kankun',
    name: 'Kankun (Water Spinach)',
    category: 'leafy',
    baseValue: 2,
    typicalWeight: '250g',
    weightPerValuePoint: 125, // 250g ÷ 2 = 125g per point
    marketPricePer250g: 140,
    description: 'Tender water spinach for quick stir-fries',
    season: 'Year-round',
    benefits: ['High in iron', 'Rich in vitamins', 'Quick cooking'],
    image: 'https://images.pexels.com/photos/4198019/pexels-photo-4198019.jpeg?auto=compress&cs=tinysrgb&w=400'
  },
  {
    id: 'leeks',
    name: 'Leeks (Lunu Kola)',
    category: 'leafy',
    baseValue: 2,
    typicalWeight: '300g',
    weightPerValuePoint: 150, // 300g ÷ 2 = 150g per point
    marketPricePer250g: 160,
    description: 'Fresh leeks for mild onion flavor',
    season: 'Year-round',
    benefits: ['Rich in vitamins', 'Anti-inflammatory', 'Heart healthy'],
    image: 'https://images.pexels.com/photos/1359326/pexels-photo-1359326.jpeg?auto=compress&cs=tinysrgb&w=400'
  },
  {
    id: 'cabbage',
    name: 'Cabbage',
    category: 'leafy',
    baseValue: 2,
    typicalWeight: '800g',
    weightPerValuePoint: 400, // 800g ÷ 2 = 400g per point (large head)
    marketPricePer250g: 50,
    description: 'Fresh cabbage heads perfect for salads and curries',
    season: 'Year-round',
    benefits: ['High in vitamin C', 'Good for digestion', 'Anti-inflammatory'],
    image: 'https://images.pexels.com/photos/1359326/pexels-photo-1359326.jpeg?auto=compress&cs=tinysrgb&w=400'
  },

  // BUSHY/FRUIT VEGETABLES (Value: 3)
  {
    id: 'bandakka',
    name: 'Bandakka (Okra)',
    category: 'bushy',
    baseValue: 3,
    typicalWeight: '300g',
    weightPerValuePoint: 100, // 300g ÷ 3 = 100g per point
    marketPricePer250g: 165,
    description: 'Fresh okra pods perfect for curries',
    season: 'Year-round',
    benefits: ['High fiber', 'Good for digestion', 'Low calories'],
    image: 'https://images.pexels.com/photos/6824358/pexels-photo-6824358.jpeg?auto=compress&cs=tinysrgb&w=400'
  },
  {
    id: 'wambatu',
    name: 'Wambatu (Eggplant)',
    category: 'bushy',
    baseValue: 3,
    typicalWeight: '400g',
    weightPerValuePoint: 133, // 400g ÷ 3 = 133g per point
    marketPricePer250g: 115,
    description: 'Purple eggplants for traditional dishes',
    season: 'Year-round',
    benefits: ['Rich in antioxidants', 'Heart healthy', 'Low calories'],
    image: 'https://images.pexels.com/photos/321551/pexels-photo-321551.jpeg?auto=compress&cs=tinysrgb&w=400'
  },
  {
    id: 'karavila',
    name: 'Karavila (Bitter Gourd)',
    category: 'bushy',
    baseValue: 3,
    typicalWeight: '300g',
    weightPerValuePoint: 100, // 300g ÷ 3 = 100g per point
    marketPricePer250g: 135,
    description: 'Traditional bitter gourd with health benefits',
    season: 'Year-round',
    benefits: ['Blood sugar control', 'Rich in nutrients', 'Traditional medicine'],
    image: 'https://images.pexels.com/photos/8844895/pexels-photo-8844895.jpeg?auto=compress&cs=tinysrgb&w=400'
  },
  {
    id: 'gherkin',
    name: 'Fresh Gherkin',
    category: 'bushy',
    baseValue: 3,
    typicalWeight: '250g',
    weightPerValuePoint: 83, // 250g ÷ 3 = 83g per point
    marketPricePer250g: 180,
    description: 'Crisp, fresh gherkins perfect for salads',
    season: 'Year-round',
    benefits: ['High in vitamins', 'Low calories', 'Great for hydration'],
    image: 'https://images.pexels.com/photos/4198019/pexels-photo-4198019.jpeg?auto=compress&cs=tinysrgb&w=400'
  },
  {
    id: 'chilies',
    name: 'Lunu Miris Chili',
    category: 'bushy',
    baseValue: 3,
    typicalWeight: '150g',
    weightPerValuePoint: 50, // 150g ÷ 3 = 50g per point
    marketPricePer250g: 165,
    description: 'Fresh green chilies for authentic flavor',
    season: 'Year-round',
    benefits: ['Rich in vitamin C', 'Boosts metabolism', 'Natural preservative'],
    image: 'https://images.pexels.com/photos/1233324/pexels-photo-1233324.jpeg?auto=compress&cs=tinysrgb&w=400'
  },
  {
    id: 'beans',
    name: 'Green Beans',
    category: 'bushy',
    baseValue: 3,
    typicalWeight: '350g',
    weightPerValuePoint: 117, // 350g ÷ 3 = 117g per point
    marketPricePer250g: 120,
    description: 'Fresh green beans perfect for stir-fries',
    season: 'Year-round',
    benefits: ['High in fiber', 'Rich in vitamins', 'Low calories'],
    image: 'https://images.pexels.com/photos/6824358/pexels-photo-6824358.jpeg?auto=compress&cs=tinysrgb&w=400'
  },
  {
    id: 'pumpkin',
    name: 'Pumpkin',
    category: 'bushy',
    baseValue: 3,
    typicalWeight: '500g',
    weightPerValuePoint: 167, // 500g ÷ 3 = 167g per point
    marketPricePer250g: 70,
    description: 'Fresh pumpkin pieces for curries and desserts',
    season: 'Year-round',
    benefits: ['Rich in beta-carotene', 'High fiber', 'Natural sweetness'],
    image: 'https://images.pexels.com/photos/144248/potatoes-vegetables-erdfrucht-bio-144248.jpeg?auto=compress&cs=tinysrgb&w=400'
  }
];

// Function to calculate vegetable value allocation for subscription plans (uses 4:2:3 ratio)
export const calculatePlanAllocation = (totalBudget: number, selectedVegetables: string[]) => {
  const selectedVegData = vegetables.filter(v => selectedVegetables.includes(v.id));
  const totalValue = selectedVegData.reduce((sum, veg) => sum + veg.baseValue, 0);
  
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
export const calculateTotalPlanWeight = (selectedVegetables: string[]) => {
  const allocation = calculatePlanAllocation(1000, selectedVegetables); // Use dummy budget for weight calculation
  return allocation.reduce((total, veg) => total + veg.allocatedWeight, 0);
};

// Function to get weight breakdown by category
export const getWeightBreakdownByCategory = (selectedVegetables: string[]) => {
  const allocation = calculatePlanAllocation(1000, selectedVegetables); // Use dummy budget
  
  const breakdown = {
    root: { count: 0, weight: 0 },
    leafy: { count: 0, weight: 0 },
    bushy: { count: 0, weight: 0 }
  };
  
  allocation.forEach(veg => {
    breakdown[veg.category].count++;
    breakdown[veg.category].weight += veg.allocatedWeight;
  });
  
  const totalWeight = Object.values(breakdown).reduce((sum, cat) => sum + cat.weight, 0);
  
  return {
    breakdown,
    totalWeight,
    percentages: {
      root: Math.round((breakdown.root.weight / totalWeight) * 100),
      leafy: Math.round((breakdown.leafy.weight / totalWeight) * 100),
      bushy: Math.round((breakdown.bushy.weight / totalWeight) * 100)
    }
  };
};

// Default vegetable selections for each plan (balanced across categories)
export const defaultPlanVegetables = {
  small: ['carrots', 'gotukola', 'bandakka', 'chilies'], // 1 root + 1 leafy + 2 bushy
  medium: ['carrots', 'radish', 'gotukola', 'mukunuwenna', 'bandakka', 'wambatu', 'chilies'], // 2 root + 2 leafy + 3 bushy
  large: ['carrots', 'radish', 'sweetpotato', 'gotukola', 'mukunuwenna', 'kankun', 'bandakka', 'wambatu', 'karavila', 'beans'] // 3 root + 3 leafy + 4 bushy
};

// Function to get vegetables by category
export const getVegetablesByCategory = (category: 'root' | 'leafy' | 'bushy') => {
  return vegetables.filter(veg => veg.category === category);
};

// Function to get market prices for individual shopping (per 250g) - now uses dynamic pricing
export const getMarketPrices = () => {
  const vegetableService = VegetableService.getInstance();
  const pricingService = PricingService.getInstance();
  const activeVegetables = vegetableService.getActiveVegetables();
  
  console.log('Getting market prices for', activeVegetables.length, 'active vegetables');
  
  return activeVegetables.map(veg => ({
    ...veg,
    price: pricingService.getPrice(veg.id) || veg.marketPricePer250g, // Use dynamic price or fallback to default
    unit: '250g',
    minOrderQuantity: 250 // Minimum order quantity in grams
  }));
};

// Function to get current price for a vegetable (used throughout the app)
export const getCurrentPrice = (vegetableId: string): number => {
  const pricingService = PricingService.getInstance();
  const vegetableService = VegetableService.getInstance();
  const vegetable = vegetableService.getVegetable(vegetableId);
  return pricingService.getPrice(vegetableId) || vegetable?.marketPricePer250g || 0;
};

// Function to get all active vegetables (replaces hardcoded vegetables array)
export const getActiveVegetables = () => {
  const vegetableService = VegetableService.getInstance();
  const activeVegetables = vegetableService.getActiveVegetables();
  
  // Fallback to hardcoded vegetables if service returns empty
  if (activeVegetables.length === 0) {
    console.warn('VegetableService returned no vegetables, falling back to hardcoded list');
    return vegetables.map(veg => ({
      ...veg,
      isAvailable: true,
      nutritionScore: 8,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }));
  }
  
  return activeVegetables;
};

// Function to get vegetables by category (dynamic)
export const getDynamicVegetablesByCategory = (category: 'root' | 'leafy' | 'bushy') => {
  const vegetableService = VegetableService.getInstance();
  const allCategoryVegetables = vegetableService.getVegetablesByCategory(category, true); // Get all vegetables in category
  const availableCategoryVegetables = allCategoryVegetables.filter(veg => veg.isAvailable);
  
  console.log(`getDynamicVegetablesByCategory(${category}): Found ${availableCategoryVegetables.length} available out of ${allCategoryVegetables.length} total`);
  
  // Only use fallback if the service has no vegetables at all for this category
  if (allCategoryVegetables.length === 0) {
    console.warn('VegetableService returned no vegetables for category', category, ', falling back to hardcoded list');
    const fallbackVegetables = vegetables
      .filter(veg => veg.category === category)
      .map(veg => ({
        ...veg,
        isAvailable: true, // Default to available for fallback
        nutritionScore: 8,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }));
    console.log(`Fallback vegetables for ${category}:`, fallbackVegetables.length);
    return fallbackVegetables;
  }
  
  // Return only available vegetables (could be empty array if all are disabled)
  return availableCategoryVegetables;
};