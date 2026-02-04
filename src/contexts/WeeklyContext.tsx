import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  WeeklySelection,
  WeeklyHistory,
  generateWeeklySelection,
  getCurrentWeekId,
  isCustomizationOpen,
  getCustomizationTimeRemaining,
  getMockWeeklyHistory
} from '../utils/weeklyShuffling';

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

  const [serviceInitialized, setServiceInitialized] = useState(false);

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

  // Load weekly selection from localStorage or generate new one
  useEffect(() => {
    if (!serviceInitialized) return;

    const currentWeekId = getCurrentWeekId();
    const storedSelection = localStorage.getItem(`weekly_selection_${currentWeekId}`);

    if (storedSelection) {
      setCurrentWeekSelection(JSON.parse(storedSelection));
    } else {
      // Generate default selection for medium plan
      const defaultSelection = generateWeeklySelection('medium', weeklyHistory);

      // Safety check: only save if we actually got vegetables
      if (defaultSelection.vegetables.length > 0) {
        setCurrentWeekSelection(defaultSelection);
        localStorage.setItem(`weekly_selection_${currentWeekId}`, JSON.stringify(defaultSelection));
      }
    }
  }, [weeklyHistory, serviceInitialized]);

  const refreshWeeklySelection = (planId: 'small' | 'medium' | 'large') => {
    const currentWeekId = getCurrentWeekId();
    const newSelection = generateWeeklySelection(planId, weeklyHistory);

    setCurrentWeekSelection(newSelection);
    localStorage.setItem(`weekly_selection_${currentWeekId}`, JSON.stringify(newSelection));
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
      refreshWeeklySelection,
      updateWeeklyHistory
    }}>
      {children}
    </WeeklyContext.Provider>
  );
};