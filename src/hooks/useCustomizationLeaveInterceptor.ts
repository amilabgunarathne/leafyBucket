import { useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useCustomizationExitContext } from '../contexts/CustomizationExitContext';
import type { LeaveTarget } from '../contexts/CustomizationExitContext';

/**
 * When on /customize with unsaved edits, opens the themed leave dialog instead of navigating.
 * Use on Link onClick: if (interceptLeave(to)) e.preventDefault();
 */
export function useCustomizationLeaveInterceptor() {
  const location = useLocation();
  const { getApi } = useCustomizationExitContext();

  const interceptLeave = useCallback(
    (target: LeaveTarget): boolean => {
      if (location.pathname !== '/customize') return false;
      const path = typeof target === 'string' ? target : target.pathname;
      if (path === '/customize') return false;
      const api = getApi();
      if (!api?.isDirty()) return false;
      api.requestLeave(target);
      return true;
    },
    [getApi, location.pathname]
  );

  return { interceptLeave };
}
