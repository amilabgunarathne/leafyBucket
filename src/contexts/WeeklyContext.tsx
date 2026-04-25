import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  WeeklySelection,
  WeeklyHistory,
  getCurrentWeekId,
  getCustomizationDeadline,
  isCustomizationOpen,
  getCustomizationTimeRemaining,
  getMockWeeklyHistory
} from '../utils/weeklyShuffling';
import VegetableService from '../services/vegetableService';
import { supabase } from '../lib/supabase';
import { getCurrentWeekDateRange, pickMarketWeekIdForApp } from '../utils/marketWeekUtils';
import {
  computeNextOpening,
  formatScheduleDisplayWithWeekDates,
  getScheduleContext,
  getScheduleWindowPartsForLocalWeek,
  type ScheduleWindowParts,
} from '../utils/customizationSchedule';

interface ScheduleDisplay {
  openLabel: string;
  closeLabel: string;
  nextOpeningDate: Date | null;
  windowParts: ScheduleWindowParts;
}

interface WeeklyContextType {
  currentWeekSelection: WeeklySelection | null;
  /** Per-plan week selection from DB (market_week_bucket_vegetables). Exposed so My Bucket can subscribe without duplicating fetches. */
  allSelections: Record<'small' | 'medium' | 'large', WeeklySelection | null>;
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
  /** Current market_weeks.id used for admin week veg + scoping subscription customizations (add/removed per week). */
  activeMarketWeekId: string | null;
  getSelectionForPlan: (planId: 'small' | 'medium' | 'large') => WeeklySelection | null;
  refreshWeeklySelection: (planId: 'small' | 'medium' | 'large') => Promise<void>;
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
  /** planId -> bucket_type_id for loading admin-set vegetables per bucket */
  const [planIdToBucketTypeId, setPlanIdToBucketTypeId] = useState<Record<string, string>>({});
  /** From DB: open/close labels and next opening for customer copy (no hardcoded Wed/Fri). */
  const [scheduleDisplay, setScheduleDisplay] = useState<ScheduleDisplay | null>(null);
  const [activeMarketWeekId, setActiveMarketWeekId] = useState<string | null>(null);

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
    const ctx = getScheduleContext();
    if (ctx) {
      const now = new Date();
      const labels = formatScheduleDisplayWithWeekDates(now, ctx.schedule);
      setScheduleDisplay({
        openLabel: labels.openLabel,
        closeLabel: labels.closeLabel,
        nextOpeningDate: computeNextOpening(now, ctx.schedule),
        windowParts: getScheduleWindowPartsForLocalWeek(now, ctx.schedule),
      });
    }
  };

  useEffect(() => {
    updateStatus();
    const interval = setInterval(updateStatus, 60000);
    return () => clearInterval(interval);
  }, []);

  // Fetch bucket types, current market week (schedule + lock); set customization context and display
  useEffect(() => {
    if (!serviceInitialized) return;
    const fetchPlanLimits = async () => {
      try {
        const { default: SubscriptionService } = await import('../services/SubscriptionService');
        const { getOrCreateCurrentWeek } = await import('../utils/marketWeekUtils');
        const { setScheduleContext } = await import('../utils/customizationSchedule');
        const { supabase } = await import('../lib/supabase');

        const bucketTypes = await SubscriptionService.getInstance().getBucketTypes();
        const { data: weeksData } = await supabase.from('market_weeks').select('id, week_start_date, week_end_date, is_locked, open_dow, open_time, close_dow, close_time').order('week_start_date', { ascending: false });
        const currentWeek = getOrCreateCurrentWeek(weeksData || []);

        const { scheduleFromMarketWeek } = await import('../utils/customizationSchedule');
        // Source of truth: market_weeks row for the current week (open_dow/time, close_dow/time); null fields use built-in defaults.
        const schedule = scheduleFromMarketWeek(currentWeek);
        setScheduleContext(schedule, currentWeek.is_locked === true);
        updateStatus();

        const { getVegCountFromBucketType } = await import('../utils/marketWeekUtils');
        const limits: Record<string, { current: number; counts: { root: number; leafy: number; bushy: number } }> = {};
        const bucketTypeIds: Record<string, string> = {};
        bucketTypes.forEach((bt: { id: string; name: string; display_item_range?: string; root_count?: number; leafy_count?: number; bushy_count?: number }) => {
          const n = bt.name.toLowerCase();
          const id = n === 'mini' || n === 'small' ? 'small' : n === 'family' || n === 'medium' ? 'medium' : 'large';
          const count = getVegCountFromBucketType(bt.display_item_range, bt.root_count, bt.leafy_count, bt.bushy_count);
          limits[id] = {
            current: count,
            counts: {
              root: bt.root_count ?? 1,
              leafy: bt.leafy_count ?? 1,
              bushy: bt.bushy_count ?? 2
            }
          };
          bucketTypeIds[id] = bt.id;
        });
        setPlanLimits(limits);
        setPlanIdToBucketTypeId(bucketTypeIds);
      } catch (e) {
        console.error('WeeklyContext: failed to fetch bucket types', e);
      }
    };
    fetchPlanLimits();
  }, [serviceInitialized]);

  // Load weekly selection from admin-defined vegetables only (market_week_bucket_vegetables). No automatic/shuffle fallback.
  useEffect(() => {
    if (!serviceInitialized) return;
    // Wait for bucket-type limits so we never use hardcoded PLAN_COUNTS (e.g. 10 for large)
    const hasPlanLimits = Object.keys(planLimits).length > 0;
    if (!hasPlanLimits) return;

    const fetchWeeklyContext = async () => {
      const vegetableService = VegetableService.getInstance();
      await vegetableService.initialize();

      const currentWeekId = getCurrentWeekId();
      const { week_start_date: mondayStr, week_end_date: weekEndStr } = getCurrentWeekDateRange();

      let marketWeekDbId: string | null = null;
      try {
        const { data: weeksForPick } = await supabase
          .from('market_weeks')
          .select('id, week_start_date, week_end_date')
          .order('week_start_date', { ascending: false });
        marketWeekDbId = pickMarketWeekIdForApp((weeksForPick || []) as import('../utils/marketWeekUtils').MarketWeekRow[]);
      } catch (_) {}

      setActiveMarketWeekId(marketWeekDbId);

      const newSelections: Record<string, WeeklySelection | null> = {};
      const allKnownIds = new Set(vegetableService.getAllVegetables().map((v) => v.id));

      const getOptions = (planId: 'small' | 'medium' | 'large') => {
        const limits = planLimits[planId];
        if (!limits) return undefined;
        return {
          requiredCount: limits.current,
          targetDistribution: limits.counts
        };
      };

      const buildSelectionFromVegIds = (vegIds: string[]): WeeklySelection => ({
        weekId: currentWeekId,
        startDate: mondayStr,
        endDate: weekEndStr,
        vegetables: vegIds,
        isCustomizationOpen: isCustomizationOpen(),
        customizationDeadline: getCustomizationDeadline().toISOString(),
        deliveryDate: weekEndStr
      });

      for (const planId of ['small', 'medium', 'large'] as const) {
        const key = `weekly_selection_${currentWeekId}_${planId}`;
        const options = getOptions(planId);
        const targetCount = options?.requiredCount ?? 0;
        const bucketTypeId = planIdToBucketTypeId[planId];

        let useDbVeggies: string[] = [];
        if (marketWeekDbId && bucketTypeId) {
          try {
            const { data: rows } = await supabase
              .from('market_week_bucket_vegetables')
              .select('vegetable_id, sort_order')
              .eq('market_week_id', marketWeekDbId)
              .eq('bucket_type_id', bucketTypeId)
              .order('sort_order', { ascending: true });
            if (rows && rows.length > 0) {
              const rawIds = (rows as { vegetable_id: string }[]).map((r) => r.vegetable_id);
              let ids = rawIds.filter((id) => allKnownIds.has(id));
              // If admin saved IDs not yet in client cache, still show them (names resolve after init/sync)
              if (rawIds.length > 0 && ids.length === 0) {
                ids = rawIds;
              }
              const cap = targetCount > 0 ? targetCount : ids.length;
              useDbVeggies = ids.slice(0, cap);
            }
          } catch (_) {}
        }

        const selection = buildSelectionFromVegIds(useDbVeggies);
        newSelections[planId] = selection;
        localStorage.setItem(key, JSON.stringify(selection));
      }

      setAllSelections(newSelections);
      setCurrentWeekSelection(newSelections.medium);
    };

    fetchWeeklyContext();
  }, [weeklyHistory, serviceInitialized, planLimits, planIdToBucketTypeId]);

  const refreshWeeklySelection = async (planId: 'small' | 'medium' | 'large') => {
    const vs = VegetableService.getInstance();
    await vs.initialize();

    const currentWeekId = getCurrentWeekId();
    const { week_start_date: mondayStr, week_end_date: weekEndStr } = getCurrentWeekDateRange();
    const bucketTypeId = planIdToBucketTypeId[planId];
    const targetCount = planLimits[planId]?.current ?? 0;

    let vegIds: string[] = [];
    if (bucketTypeId) {
      try {
        const { data: weeksForPick } = await supabase
          .from('market_weeks')
          .select('id, week_start_date, week_end_date')
          .order('week_start_date', { ascending: false });
        const marketWeekDbId = pickMarketWeekIdForApp((weeksForPick || []) as import('../utils/marketWeekUtils').MarketWeekRow[]);
        setActiveMarketWeekId(marketWeekDbId);
        if (marketWeekDbId) {
          const { data: rows } = await supabase
            .from('market_week_bucket_vegetables')
            .select('vegetable_id, sort_order')
            .eq('market_week_id', marketWeekDbId)
            .eq('bucket_type_id', bucketTypeId)
            .order('sort_order', { ascending: true });
          if (rows?.length) {
            const known = new Set(vs.getAllVegetables().map((v) => v.id));
            const rawIds = (rows as { vegetable_id: string }[]).map((r) => r.vegetable_id);
            let ids = rawIds.filter((id) => known.has(id));
            if (rawIds.length > 0 && ids.length === 0) ids = rawIds;
            const cap = targetCount > 0 ? targetCount : ids.length;
            vegIds = ids.slice(0, cap);
          }
        }
      } catch (_) {}
    }

    const newSelection: WeeklySelection = {
      weekId: currentWeekId,
      startDate: mondayStr,
      endDate: weekEndStr,
      vegetables: vegIds,
      isCustomizationOpen: isCustomizationOpen(),
      customizationDeadline: getCustomizationDeadline().toISOString(),
      deliveryDate: weekEndStr
    };
    setCurrentWeekSelection(newSelection);
    setAllSelections((prev) => ({ ...prev, [planId]: newSelection }));
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
      allSelections,
      weeklyHistory,
      isCustomizationAllowed,
      timeRemaining,
      scheduleDisplay,
      activeMarketWeekId,
      getSelectionForPlan,
      refreshWeeklySelection,
      updateWeeklyHistory
    }}>
      {children}
    </WeeklyContext.Provider>
  );
};