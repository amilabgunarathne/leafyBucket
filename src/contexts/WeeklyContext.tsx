import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  WeeklySelection,
  WeeklyHistory,
  generateWeeklySelection,
  getCurrentWeekId,
  isCustomizationOpen,
  getCustomizationTimeRemaining,
  getMockWeeklyHistory,
  PLAN_COUNTS
} from '../utils/weeklyShuffling';
import VegetableService from '../services/vegetableService';

interface WeeklyContextType {
  currentWeekSelection: WeeklySelection | null;
  weeklyHistory: WeeklyHistory;
  isCustomizationAllowed: boolean;
  timeRemaining: {
    days: number;
    hours: number;
    minutes: number;
    isExpired: boolean;
  };
  getSelectionForPlan: (planId: 'small' | 'medium' | 'large') => WeeklySelection | null;
  refreshWeeklySelection: (planId: 'small' | 'medium' | 'large') => void;
  updateWeeklyHistory: (weekId: string, vegetables: string[]) => void;
}

const WeeklyContext = createContext<WeeklyContextType | undefined>(undefined);

export const useWeekly = () => {
  const context = useContext(WeeklyContext);
  if (context === undefined) {
    throw new Error('useWeekly must be used within a WeeklyProvider');
  }
  return context;
};

export const WeeklyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentWeekSelection, setCurrentWeekSelection] = useState<WeeklySelection | null>(null);
  const [weeklyHistory, setWeeklyHistory] = useState<WeeklyHistory>(getMockWeeklyHistory());
  const [isCustomizationAllowed, setIsCustomizationAllowed] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    isExpired: false
  });
  const [allSelections, setAllSelections] = useState<Record<string, WeeklySelection | null>>({
    small: null,
    medium: null,
    large: null
  });

  const [serviceInitialized, setServiceInitialized] = useState(false);
  /** DB-driven: items per category and total count per plan (from bucket_types) */
  const [planLimits, setPlanLimits] = useState<Record<string, { current: number; counts: { root: number; leafy: number; bushy: number } }>>({});

  // Initialize VegetableService
  useEffect(() => {
    const init = async () => {
      const service = (await import('../services/vegetableService')).default.getInstance();
      await service.initialize();
      setServiceInitialized(true);
    };
    init();
  }, []);

  // Update customization status and time remaining every minute
  useEffect(() => {
    const updateStatus = () => {
      setIsCustomizationAllowed(isCustomizationOpen());
      setTimeRemaining(getCustomizationTimeRemaining());
    };

    updateStatus(); // Initial update
    const interval = setInterval(updateStatus, 60000); // Update every minute

    return () => clearInterval(interval);
  }, []);

  // Fetch bucket types from DB for per-plan category counts (same mapping as CustomizationPage)
  useEffect(() => {
    if (!serviceInitialized) return;
    const fetchPlanLimits = async () => {
      try {
        const { default: SubscriptionService } = await import('../services/SubscriptionService');
        const bucketTypes = await SubscriptionService.getInstance().getBucketTypes();
        const limits: Record<string, { current: number; counts: { root: number; leafy: number; bushy: number } }> = {};
        bucketTypes.forEach((bt: { name: string; display_item_range?: string; root_count?: number; leafy_count?: number; bushy_count?: number }) => {
          const n = bt.name.toLowerCase();
          const id = n === 'mini' || n === 'small' ? 'small' : n === 'family' || n === 'medium' ? 'medium' : 'large';
          const match = (bt.display_item_range || '').match(/\d+/);
          const count = match ? parseInt(match[0], 10) : (bt.root_count ?? 0) + (bt.leafy_count ?? 0) + (bt.bushy_count ?? 0) || 4;
          limits[id] = {
            current: count,
            counts: {
              root: bt.root_count ?? 1,
              leafy: bt.leafy_count ?? 1,
              bushy: bt.bushy_count ?? 2
            }
          };
        });
        setPlanLimits(limits);
      } catch (e) {
        console.error('WeeklyContext: failed to fetch bucket types', e);
      }
    };
    fetchPlanLimits();
  }, [serviceInitialized]);

  // Fetch Weekly Context: build selections using DB plan limits when available
  useEffect(() => {
    if (!serviceInitialized) return;

    const fetchWeeklyContext = async () => {
      const currentWeekId = getCurrentWeekId();
      const newSelections: Record<string, WeeklySelection | null> = {};
      const vegetableService = VegetableService.getInstance();
      const allVegetables = vegetableService.getActiveVegetables();
      const allActiveIds = allVegetables.map(v => v.id);

      const getOptions = (planId: 'small' | 'medium' | 'large') => {
        const limits = planLimits[planId];
        if (!limits) return undefined;
        return {
          requiredCount: limits.current,
          targetDistribution: limits.counts
        };
      };

      for (const planId of ['small', 'medium', 'large'] as const) {
        const key = `weekly_selection_${currentWeekId}_${planId}`;
        const stored = localStorage.getItem(key);
        const options = getOptions(planId);
        const targetCount = options?.requiredCount ?? PLAN_COUNTS[planId];

        const categoryCounts = (vegIds: string[]) => {
          const r = { root: 0, leafy: 0, bushy: 0 };
          vegIds.forEach(id => {
            const veg = allVegetables.find(v => v.id === id);
            if (veg?.category === 'root') r.root++;
            else if (veg?.category === 'leafy') r.leafy++;
            else if (veg?.category === 'bushy') r.bushy++;
          });
          return r;
        };

        const matchesTargetDistribution = (vegIds: string[]) => {
          if (!options?.targetDistribution) return true;
          const counts = categoryCounts(vegIds);
          const t = options.targetDistribution;
          return counts.root === t.root && counts.leafy === t.leafy && counts.bushy === t.bushy;
        };

        if (stored) {
          const selection: WeeklySelection = JSON.parse(stored);
          const validVegs = selection.vegetables.filter(id => allActiveIds.includes(id));

          const incomplete = validVegs.length < targetCount;
          const wrongMix = options && validVegs.length >= targetCount && !matchesTargetDistribution(validVegs);

          if (incomplete || wrongMix) {
            const newSelection = generateWeeklySelection(planId, weeklyHistory, undefined, options);
            localStorage.setItem(key, JSON.stringify(newSelection));
            newSelections[planId] = newSelection;
          } else {
            if (validVegs.length !== selection.vegetables.length) {
              selection.vegetables = validVegs;
              localStorage.setItem(key, JSON.stringify(selection));
            }
            newSelections[planId] = selection;
          }
        } else {
          const selection = generateWeeklySelection(planId, weeklyHistory, undefined, options);
          localStorage.setItem(key, JSON.stringify(selection));
          newSelections[planId] = selection;
        }
      }

      setAllSelections(newSelections);
      setCurrentWeekSelection(newSelections.medium);
    };

    fetchWeeklyContext();
  }, [weeklyHistory, serviceInitialized, planLimits]);

  const refreshWeeklySelection = (planId: 'small' | 'medium' | 'large') => {
    const currentWeekId = getCurrentWeekId();
    const options = planLimits[planId] ? { requiredCount: planLimits[planId].current, targetDistribution: planLimits[planId].counts } : undefined;
    const newSelection = generateWeeklySelection(planId, weeklyHistory, undefined, options);

    setCurrentWeekSelection(newSelection);
    setAllSelections((prev: any) => ({ ...prev, [planId]: newSelection }));
    localStorage.setItem(`weekly_selection_${currentWeekId}_${planId}`, JSON.stringify(newSelection));
  };

  const getSelectionForPlan = (planId: 'small' | 'medium' | 'large') => {
    return allSelections[planId] || null;
  };

  const updateWeeklyHistory = (weekId: string, vegetables: string[]) => {
    const updatedHistory = { ...weeklyHistory, [weekId]: vegetables };
    setWeeklyHistory(updatedHistory);
    localStorage.setItem('weekly_history', JSON.stringify(updatedHistory));
  };

  return (
    <WeeklyContext.Provider value={{
      currentWeekSelection,
      weeklyHistory,
      isCustomizationAllowed,
      timeRemaining,
      getSelectionForPlan,
      refreshWeeklySelection,
      updateWeeklyHistory
    }}>
      {children}
    </WeeklyContext.Provider>
  );
};