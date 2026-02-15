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

interface ScheduleDisplay {
  openLabel: string;
  closeLabel: string;
  nextOpeningDate: Date | null;
}

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
  /** From DB: when customization opens/closes and next opening (for customer copy). */
  scheduleDisplay: ScheduleDisplay | null;
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
  /** From DB: open/close labels and next opening for customer copy (no hardcoded Wed/Fri). */
  const [scheduleDisplay, setScheduleDisplay] = useState<ScheduleDisplay | null>(null);

  // Initialize VegetableService
  useEffect(() => {
    const init = async () => {
      const service = (await import('../services/vegetableService')).default.getInstance();
      await service.initialize();
      setServiceInitialized(true);
    };
    init();
  }, []);

  // Update customization status and time remaining (uses DB schedule once setScheduleContext is called)
  const updateStatus = () => {
    setIsCustomizationAllowed(isCustomizationOpen());
    setTimeRemaining(getCustomizationTimeRemaining());
  };

  useEffect(() => {
    updateStatus();
    const interval = setInterval(updateStatus, 60000);
    return () => clearInterval(interval);
  }, []);

  // Fetch bucket types, current week (auto or from DB), customization schedule from DB; set context and display
  useEffect(() => {
    if (!serviceInitialized) return;
    const fetchPlanLimits = async () => {
      try {
        const { default: SubscriptionService } = await import('../services/SubscriptionService');
        const { getOrCreateCurrentWeek, getVegCountForPlan } = await import('../utils/marketWeekUtils');
        const { setScheduleContext, formatScheduleDisplay, computeNextOpening } = await import('../utils/customizationSchedule');
        const { supabase } = await import('../lib/supabase');

        const bucketTypes = await SubscriptionService.getInstance().getBucketTypes();
        const { data: weeksData } = await supabase.from('market_weeks').select('id, week_start_date, week_end_date, is_locked, veg_count_small, veg_count_medium, veg_count_large').order('week_start_date', { ascending: false });
        const currentWeek = getOrCreateCurrentWeek(weeksData || []);

        const { data: scheduleRows } = await supabase.from('customization_schedule').select('id, open_dow, open_time, close_dow, close_time').limit(1);
        const schedule = Array.isArray(scheduleRows) && scheduleRows.length > 0 ? scheduleRows[0] : null;
        setScheduleContext(schedule, currentWeek.is_locked === true);

        const labels = formatScheduleDisplay(schedule);
        setScheduleDisplay(labels ? {
          openLabel: labels.openLabel,
          closeLabel: labels.closeLabel,
          nextOpeningDate: computeNextOpening(new Date(), schedule)
        } : null);

        updateStatus();

        const limits: Record<string, { current: number; counts: { root: number; leafy: number; bushy: number } }> = {};
        bucketTypes.forEach((bt: { name: string; display_item_range?: string; root_count?: number; leafy_count?: number; bushy_count?: number }) => {
          const n = bt.name.toLowerCase();
          const id = n === 'mini' || n === 'small' ? 'small' : n === 'family' || n === 'medium' ? 'medium' : 'large';
          const count = getVegCountForPlan(id, currentWeek, bt.display_item_range || '');
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
      scheduleDisplay,
      getSelectionForPlan,
      refreshWeeklySelection,
      updateWeeklyHistory
    }}>
      {children}
    </WeeklyContext.Provider>
  );
};