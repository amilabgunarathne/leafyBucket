import VegetableService from '../services/vegetableService';
import { getMondayOfWeek } from './marketWeekUtils';

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

// Week is always Monday–Sunday. Week ID = YYYY-WW (week number of year based on Monday).

// Get current week ID (format: YYYY-WW) using Monday–Sunday week.
export const getCurrentWeekId = (): string => {
  const now = new Date();
  const monday = getMondayOfWeek(now);
  const startOfYear = new Date(monday.getFullYear(), 0, 1);
  const firstMonday = getMondayOfWeek(startOfYear);
  const diffMs = monday.getTime() - firstMonday.getTime();
  const weekNumber = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1;
  return `${monday.getFullYear()}-${weekNumber.toString().padStart(2, '0')}`;
};

// Get week dates (Monday to Sunday) for a given YYYY-WW.
export const getWeekDates = (weekId: string) => {
  const [year, week] = weekId.split('-').map(Number);
  const startOfYear = new Date(year, 0, 1);
  const firstMonday = getMondayOfWeek(startOfYear);
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

// Schedule: from DB (customization_schedule) + per-week is_locked. Default Wed 12:00 → Fri 23:59.
// WeeklyContext sets schedule context; these use it when available.

import { getIsOpen, getDeadline, computeNextOpening, getScheduleContext, getTimeRemaining } from './customizationSchedule';

// Check if customization is currently allowed (uses DB schedule + week lock when context set)
export const isCustomizationOpen = (): boolean => getIsOpen(new Date());

// Get next customization opening (uses DB schedule when context set)
export const getNextCustomizationOpening = (): Date => {
  const now = new Date();
  if (getIsOpen(now)) return now;
  const ctx = getScheduleContext();
  return computeNextOpening(now, ctx?.schedule ?? null);
};

// Get customization deadline for current window (uses DB schedule when context set)
export const getCustomizationDeadline = (): Date => getDeadline(new Date());

// Get delivery date: Sunday (purchasing is Saturday)
export const getDeliveryDate = (): Date => {
  const now = new Date();
  const dayOfWeek = now.getDay();

  const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
  const sunday = new Date(now);
  sunday.setDate(now.getDate() + daysUntilSunday);
  sunday.setHours(8, 0, 0, 0); // 8 AM delivery
  return sunday;
};

/** Target count per category (from bucket_types). When provided, selection respects DB config. */
export type TargetDistribution = { root: number; leafy: number; bushy: number };

// Shuffle algorithm with history awareness
export const shuffleVegetablesForWeek = (
  availableVegetables: string[],
  requiredCount: number,
  weeklyHistory: WeeklyHistory,
  currentWeekId: string,
  lookBackWeeks: number = 4,
  targetDistribution?: TargetDistribution
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

  // Use DB target distribution if provided; else fallback to hardcoded by count
  const getTargetDistributionFallback = (count: number): TargetDistribution => {
    if (count <= 4) {
      return { root: 1, leafy: 1, bushy: count - 2 };
    } else if (count <= 7) {
      return { root: 2, leafy: 2, bushy: count - 4 };
    } else {
      return { root: 3, leafy: 3, bushy: count - 6 };
    }
  };

  const target = targetDistribution ?? getTargetDistributionFallback(requiredCount);
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

export const PLAN_COUNTS = {
  small: 4,
  medium: 7,
  large: 10
};

// Generate weekly selection for a plan (optionally use DB bucket type counts)
export const generateWeeklySelection = (
  planId: 'small' | 'medium' | 'large',
  weeklyHistory: WeeklyHistory,
  weekId?: string,
  options?: { targetDistribution?: TargetDistribution; requiredCount?: number }
): WeeklySelection => {
  const currentWeekId = weekId || getCurrentWeekId();
  const weekDates = getWeekDates(currentWeekId);

  const requiredCount = options?.requiredCount ?? PLAN_COUNTS[planId];
  const vegetableService = VegetableService.getInstance();
  const allActiveVegetables = vegetableService.getActiveVegetables();
  const allVegetableIds = allActiveVegetables.map(v => v.id);

  if (allVegetableIds.length === 0) {
    console.warn('generateWeeklySelection: No active vegetables found in service');
  }

  const selectedVegetables = shuffleVegetablesForWeek(
    allVegetableIds,
    requiredCount,
    weeklyHistory,
    currentWeekId,
    4,
    options?.targetDistribution
  );

  // CRITICAL: Double-check that all selected IDs actually exist in the DB
  const validatedVegetables = selectedVegetables.filter(id =>
    allActiveVegetables.some(v => v.id === id)
  );

  return {
    weekId: currentWeekId,
    startDate: weekDates.monday.toISOString().split('T')[0],
    endDate: weekDates.weekEnd.toISOString().split('T')[0],
    vegetables: validatedVegetables,
    isCustomizationOpen: isCustomizationOpen(),
    customizationDeadline: getCustomizationDeadline().toISOString(),
    deliveryDate: getDeliveryDate().toISOString().split('T')[0]
  };
};

// Get time remaining for customization (uses same deadline as getCustomizationDeadline)
export const getCustomizationTimeRemaining = (): {
  days: number;
  hours: number;
  minutes: number;
  isExpired: boolean;
} => getTimeRemaining(getCustomizationDeadline(), new Date());

// Mock weekly history for demonstration - Updated with valid IDs from seed data
export const getMockWeeklyHistory = (): WeeklyHistory => {
  return {
    '2024-01': ['carrots', 'gotukola', 'bandakka', 'chilies'],
    '2024-02': ['radish', 'mukunuwenna', 'wambatu', 'beans'],
    '2024-03': ['sweetpotato', 'kankun', 'karavila', 'beetroot'],
    '2024-04': ['nivithi', 'gotukola', 'bandakka', 'chilies']
  };
};