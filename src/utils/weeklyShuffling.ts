import { getActiveVegetables, defaultPlanVegetables } from '../data/vegetables';
import VegetableService from '../services/vegetableService';

export interface WeeklySelection {
  weekId: string;
  startDate: string;
  endDate: string;
  vegetables: string[];
  isCustomizationOpen: boolean;
  customizationDeadline: string;
  deliveryDate: string;
}

export interface WeeklyHistory {
  [weekId: string]: string[]; // vegetable IDs used in each week
}

// Get current week ID (format: YYYY-WW)
export const getCurrentWeekId = (): string => {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const days = Math.floor((now.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
  const weekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7);
  return `${now.getFullYear()}-${weekNumber.toString().padStart(2, '0')}`;
};

// Get week dates (Monday to Sunday)
export const getWeekDates = (weekId: string) => {
  const [year, week] = weekId.split('-').map(Number);
  const startOfYear = new Date(year, 0, 1);
  const daysToFirstMonday = (8 - startOfYear.getDay()) % 7;
  const firstMonday = new Date(year, 0, 1 + daysToFirstMonday);
  
  const weekStart = new Date(firstMonday);
  weekStart.setDate(firstMonday.getDate() + (week - 1) * 7);
  
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  
  return {
    monday: new Date(weekStart),
    friday: new Date(weekStart.getTime() + 4 * 24 * 60 * 60 * 1000),
    sunday: new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000),
    weekEnd: weekEnd
  };
};

// Check if customization is currently allowed
export const isCustomizationOpen = (): boolean => {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const currentHour = now.getHours();
  
  // Customization is open from Monday (1) to Friday (5)
  // Monday 00:00 to Friday 23:59:59
  if (dayOfWeek >= 1 && dayOfWeek <= 5) {
    return true;
  }
  
  // Also allow Saturday and Sunday for testing purposes
  // In production, you might want to remove this
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return true; // Allow customization on weekends for testing
  }
  
  return false;
};

// Get next customization opening time
export const getNextCustomizationOpening = (): Date => {
  const now = new Date();
  const dayOfWeek = now.getDay();
  
  if (isCustomizationOpen()) {
    return now; // Already open
  }
  
  // Calculate days until next Monday
  let daysUntilMonday;
  if (dayOfWeek === 0) { // Sunday
    daysUntilMonday = 1;
  } else if (dayOfWeek === 6) { // Saturday
    daysUntilMonday = 2;
  } else {
    // Should not happen if customization is closed, but just in case
    daysUntilMonday = (8 - dayOfWeek) % 7;
  }
  
  const nextMonday = new Date(now);
  nextMonday.setDate(now.getDate() + daysUntilMonday);
  nextMonday.setHours(0, 0, 0, 0);
  
  return nextMonday;
};

// Get customization deadline for current week
export const getCustomizationDeadline = (): Date => {
  const now = new Date();
  const dayOfWeek = now.getDay();
  
  // Find the Friday of current week
  let daysUntilFriday;
  if (dayOfWeek <= 5) { // Monday to Friday
    daysUntilFriday = 5 - dayOfWeek;
  } else { // Weekend - next Friday
    daysUntilFriday = 5 + (7 - dayOfWeek);
  }
  
  const friday = new Date(now);
  friday.setDate(now.getDate() + daysUntilFriday);
  friday.setHours(23, 59, 59, 999);
  
  return friday;
};

// Get delivery date for current week
export const getDeliveryDate = (): Date => {
  const now = new Date();
  const dayOfWeek = now.getDay();
  
  // Find the Sunday of current week or next week
  let daysUntilSunday;
  if (dayOfWeek === 0) { // Already Sunday
    daysUntilSunday = 0;
  } else { // Monday to Saturday
    daysUntilSunday = 7 - dayOfWeek;
  }
  
  const sunday = new Date(now);
  sunday.setDate(now.getDate() + daysUntilSunday);
  sunday.setHours(8, 0, 0, 0); // 8 AM delivery time
  
  return sunday;
};

// Shuffle algorithm with history awareness
export const shuffleVegetablesForWeek = (
  availableVegetables: string[],
  requiredCount: number,
  weeklyHistory: WeeklyHistory,
  currentWeekId: string,
  lookBackWeeks: number = 4
): string[] => {
  // Get vegetables used in recent weeks
  const vegetableService = VegetableService.getInstance();
  const allVegetables = vegetableService.getActiveVegetables();
  
  const recentlyUsed = new Set<string>();
  const currentWeekNum = parseInt(currentWeekId.split('-')[1]);
  const currentYear = parseInt(currentWeekId.split('-')[0]);
  
  for (let i = 1; i <= lookBackWeeks; i++) {
    let checkWeekNum = currentWeekNum - i;
    let checkYear = currentYear;
    
    if (checkWeekNum <= 0) {
      checkYear -= 1;
      checkWeekNum = 52 + checkWeekNum; // Approximate weeks in year
    }
    
    const checkWeekId = `${checkYear}-${checkWeekNum.toString().padStart(2, '0')}`;
    const weekVegetables = weeklyHistory[checkWeekId] || [];
    weekVegetables.forEach(vegId => recentlyUsed.add(vegId));
  }
  
  // Separate vegetables by category for balanced selection
  const categorizedVegetables = {
    root: availableVegetables.filter(id => {
      const veg = allVegetables.find(v => v.id === id);
      return veg?.category === 'root';
    }),
    leafy: availableVegetables.filter(id => {
      const veg = allVegetables.find(v => v.id === id);
      return veg?.category === 'leafy';
    }),
    bushy: availableVegetables.filter(id => {
      const veg = allVegetables.find(v => v.id === id);
      return veg?.category === 'bushy';
    })
  };
  
  // Prioritize vegetables not used recently
  const prioritizeByRecency = (vegetables: string[]) => {
    const fresh = vegetables.filter(id => !recentlyUsed.has(id));
    const used = vegetables.filter(id => recentlyUsed.has(id));
    return [...shuffleArray(fresh), ...shuffleArray(used)];
  };
  
  const prioritizedCategories = {
    root: prioritizeByRecency(categorizedVegetables.root),
    leafy: prioritizeByRecency(categorizedVegetables.leafy),
    bushy: prioritizeByRecency(categorizedVegetables.bushy)
  };
  
  // Calculate target distribution based on required count
  const getTargetDistribution = (count: number) => {
    if (count <= 4) {
      return { root: 1, leafy: 1, bushy: count - 2 };
    } else if (count <= 7) {
      return { root: 2, leafy: 2, bushy: count - 4 };
    } else {
      return { root: 3, leafy: 3, bushy: count - 6 };
    }
  };
  
  const target = getTargetDistribution(requiredCount);
  const selected: string[] = [];
  
  // Select vegetables by category
  ['root', 'leafy', 'bushy'].forEach(category => {
    const categoryTarget = target[category as keyof typeof target];
    const categoryVegetables = prioritizedCategories[category as keyof typeof prioritizedCategories];
    
    for (let i = 0; i < categoryTarget && i < categoryVegetables.length; i++) {
      selected.push(categoryVegetables[i]);
    }
  });
  
  // Fill remaining slots if needed
  const remaining = requiredCount - selected.length;
  if (remaining > 0) {
    const allRemaining = availableVegetables.filter(id => !selected.includes(id));
    const prioritizedRemaining = prioritizeByRecency(allRemaining);
    
    for (let i = 0; i < remaining && i < prioritizedRemaining.length; i++) {
      selected.push(prioritizedRemaining[i]);
    }
  }
  
  return selected.slice(0, requiredCount);
};

// Helper function to shuffle array
const shuffleArray = <T>(array: T[]): T[] => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

// Generate weekly selection for a plan
export const generateWeeklySelection = (
  planId: 'small' | 'medium' | 'large',
  weeklyHistory: WeeklyHistory,
  weekId?: string
): WeeklySelection => {
  const currentWeekId = weekId || getCurrentWeekId();
  const weekDates = getWeekDates(currentWeekId);
  
  const planCounts = {
    small: 4,
    medium: 7,
    large: 10
  };
  
  const requiredCount = planCounts[planId];
  const vegetableService = VegetableService.getInstance();
  const allVegetableIds = vegetableService.getActiveVegetables().map(v => v.id);
  
  const selectedVegetables = shuffleVegetablesForWeek(
    allVegetableIds,
    requiredCount,
    weeklyHistory,
    currentWeekId
  );
  
  return {
    weekId: currentWeekId,
    startDate: weekDates.monday.toISOString().split('T')[0],
    endDate: weekDates.weekEnd.toISOString().split('T')[0],
    vegetables: selectedVegetables,
    isCustomizationOpen: isCustomizationOpen(),
    customizationDeadline: getCustomizationDeadline().toISOString(),
    deliveryDate: getDeliveryDate().toISOString().split('T')[0]
  };
};

// Get time remaining for customization
export const getCustomizationTimeRemaining = (): {
  days: number;
  hours: number;
  minutes: number;
  isExpired: boolean;
} => {
  const now = new Date();
  const deadline = getCustomizationDeadline();
  const diff = deadline.getTime() - now.getTime();
  
  if (diff <= 0) {
    return { days: 0, hours: 0, minutes: 0, isExpired: true };
  }
  
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  
  return { days, hours, minutes, isExpired: false };
};

// Mock weekly history for demonstration
export const getMockWeeklyHistory = (): WeeklyHistory => {
  return {
    '2024-01': ['carrots', 'gotukola', 'bandakka', 'chilies'],
    '2024-02': ['radish', 'mukunuwenna', 'wambatu', 'beans'],
    '2024-03': ['sweetpotato', 'kankun', 'karavila', 'gherkin'],
    '2024-04': ['beetroot', 'leeks', 'pumpkin', 'cabbage']
  };
};