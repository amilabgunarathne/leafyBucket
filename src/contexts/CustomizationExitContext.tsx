import { createContext, useCallback, useContext, useRef, type ReactNode } from 'react';

/** Where to go after the user confirms leaving the customize page. */
export type LeaveTarget = string | { pathname: string; state?: unknown };

export type CustomizationExitApi = {
  isDirty: () => boolean;
  canSave: boolean;
  save: () => Promise<boolean>;
  requestLeave: (target: LeaveTarget) => void;
};

type CtxValue = {
  register: (api: CustomizationExitApi) => void;
  unregister: () => void;
  getApi: () => CustomizationExitApi | null;
};

const CustomizationExitContext = createContext<CtxValue | null>(null);

export function CustomizationExitProvider({ children }: { children: ReactNode }) {
  const ref = useRef<CustomizationExitApi | null>(null);
  const register = useCallback((api: CustomizationExitApi) => {
    ref.current = api;
  }, []);
  const unregister = useCallback(() => {
    ref.current = null;
  }, []);
  const getApi = useCallback(() => ref.current, []);
  return (
    <CustomizationExitContext.Provider value={{ register, unregister, getApi }}>
      {children}
    </CustomizationExitContext.Provider>
  );
}

export function useCustomizationExitContext() {
  const ctx = useContext(CustomizationExitContext);
  if (!ctx) {
    throw new Error('CustomizationExitProvider is required');
  }
  return ctx;
}
