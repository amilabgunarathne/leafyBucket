import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { supabase, REMEMBER_ME_KEY } from '../lib/supabase';
import { normalizeSubscriptionCustomizations } from '../utils/subscriptionCustomizations';

// Session timeout: idle = no activity, absolute = max session length regardless of activity
const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000;   // 30 minutes
const SESSION_ABSOLUTE_TIMEOUT_MS = 24 * 60 * 60 * 1000; // 24 hours
const SESSION_CHECK_INTERVAL_MS = 60 * 1000;      // check every 1 minute
const SESSION_START_KEY = 'leafy_session_started_at';

// Prevent app from hanging if Supabase is slow/unreachable
const AUTH_INIT_TIMEOUT_MS = 12 * 1000;   // 12 seconds
const FETCH_PROFILE_TIMEOUT_MS = 10 * 1000; // 10 seconds

function getAuthStorage(): Storage {
  if (typeof window === 'undefined') return localStorage;
  try {
    const raw = localStorage.getItem(REMEMBER_ME_KEY);
    const remember = raw === null || raw === 'true';
    return remember ? localStorage : sessionStorage;
  } catch {
    return localStorage;
  }
}

interface User {
  id: string;
  email: string;
  name: string;
  phone?: string;
  address?: string;
  city?: string;
  role: 'user' | 'admin';
  subscription?: {
    id: string; // New field
    plan: 'small' | 'medium' | 'large';
    status: 'active' | 'paused' | 'cancelled';
    nextDelivery: string;
    customizations: {
      excludedVegetables: string[];
      removedVegetables: string[];
      addedVegetables: string[];
      deliveryDay: string;
    };
  };
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<{ success: boolean; error?: string }>;
  signup: (email: string, password: string, name: string, phone: string, rememberMe?: boolean, city?: string) => Promise<{ success: boolean; error?: string; data?: any }>;
  resetPassword: (email: string) => Promise<{ success: boolean; error?: string }>;
  updateEmail: (newEmail: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  isLoggingOut: boolean;
  updateUser: (userData: Partial<User>) => void;
  isLoading: boolean;
  isAdmin: () => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Helper to map DB bucket names to app plans
const mapBucketTypeToPlan = (bucketName?: string): 'small' | 'medium' | 'large' => {
  switch (bucketName) {
    case 'Mini': return 'small';
    case 'Family': return 'medium';
    case 'Plus': return 'large';
    default: return 'medium';
  }
};


export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const lastActivityAt = useRef(Date.now());
  const logoutRef = useRef<() => void>(() => {});

  // Helper to fetch full user profile and subscription (with timeout so app never hangs)
  const fetchUserProfile = async (userId: string, email: string) => {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('FETCH_PROFILE_TIMEOUT')), FETCH_PROFILE_TIMEOUT_MS)
    );

    const profileWork = async () => {
      // 1. Fetch Profile
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (profileError) throw profileError;

      // If profile.phone is missing but signup sent it in user_metadata, sync it to the DB and use it
      let phone = profile.phone || '';
      const { data: authData } = await supabase.auth.getUser();
      const metadataPhone = authData.user?.user_metadata?.phone;
      if (!phone && metadataPhone && typeof metadataPhone === 'string') {
        phone = metadataPhone.trim();
        await supabase.from('profiles').update({ phone }).eq('id', userId);
      }

      // 2. Fetch subscription (active or paused – paused is still a plan, just deliveries on hold)
      const { data: subscription } = await supabase
        .from('subscriptions')
        .select('*, bucket_type:bucket_types(*)')
        .eq('user_id', userId)
        .in('status', ['active', 'paused'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      // Construct User Object
      const subRow = subscription as Record<string, unknown> | null | undefined;
      const userData: User = {
        id: userId,
        email: email,
        name: profile.full_name || email.split('@')[0],
        phone,
        address: profile.address || '',
        city: profile.city || undefined,
        role: profile.role || 'user',
        subscription: subscription ? {
          id: subscription.id,
          plan: mapBucketTypeToPlan(subscription.bucket_type?.name),
          status: subscription.status,
          nextDelivery: subscription.next_delivery || new Date().toISOString(), // Fallback
          customizations: normalizeSubscriptionCustomizations(subRow?.customizations)
        } : undefined
      };

      if (typeof window !== 'undefined') {
        const storage = getAuthStorage();
        if (!storage.getItem(SESSION_START_KEY)) {
          storage.setItem(SESSION_START_KEY, String(Date.now()));
        }
      }
      setUser(userData);
    };

    try {
      await Promise.race([profileWork(), timeoutPromise]);
    } catch (error: unknown) {
      if (error instanceof Error && error.message === 'FETCH_PROFILE_TIMEOUT') {
        console.warn('Profile fetch timeout – Supabase may be slow or unreachable.');
        setUser(null);
      } else {
        console.error('Error fetching user profile:', error);
        // No profile row (e.g. deleted from profiles but still in auth.users) – sign out so they cannot use the app
        const err = error as { code?: string; message?: string };
        const isNoProfile = err?.code === 'PGRST116' || (typeof err?.message === 'string' && (err.message.includes('row') || err.message.includes('Rows')));
        if (isNoProfile) {
          await supabase.auth.signOut();
          setUser(null);
        } else {
          // Other errors: use minimal fallback so the app doesn't break
          let fallbackName = 'User';
          const { data } = await supabase.auth.getUser();
          if (data.user?.user_metadata?.name) {
            fallbackName = data.user.user_metadata.name;
          } else if (email) {
            fallbackName = email.split('@')[0];
          }
          if (typeof window !== 'undefined') {
            const storage = getAuthStorage();
            if (!storage.getItem(SESSION_START_KEY)) {
              storage.setItem(SESSION_START_KEY, String(Date.now()));
            }
          }
          setUser({
            id: userId,
            email: email,
            name: fallbackName,
            role: 'user'
          });
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const isEmailChangeCallback = () => {
      if (typeof window === 'undefined') return false;
      const search = window.location.search || '';
      const hash = window.location.hash || '';
      return search.includes('email_changed=1') || hash.includes('type=email_change');
    };

    const isAuthCallback = () => {
      if (typeof window === 'undefined') return false;
      const hash = window.location.hash || '';
      const search = window.location.search || '';
      return (
        hash.includes('access_token=') ||
        hash.includes('type=email_change') ||
        search.includes('token_hash=') ||
        hash.includes('type=recovery')
      );
    };

    const initAuth = async () => {
      // Email change confirmation: let client exchange token so Supabase commits the new email,
      // then sign out so user must sign in with the new email.
      if (isEmailChangeCallback()) {
        // Process the URL so the client exchanges the token with Supabase (this finalizes the email update on the server)
        await supabase.auth.getSession();
        if (typeof window !== 'undefined' && window.location.hash) {
          await supabase.auth.refreshSession();
        }
        await supabase.auth.signOut();
        if (typeof window !== 'undefined' && window.history.replaceState) {
          window.history.replaceState(null, '', window.location.pathname + '?email_changed=1');
        }
        setUser(null);
        setIsLoading(false);
        return;
      }

      let { data: { session } } = await supabase.auth.getSession();

      // Other auth callbacks (e.g. signup, password reset): process URL and refresh session
      if (isAuthCallback()) {
        await supabase.auth.refreshSession();
        const next = await supabase.auth.getSession();
        session = next.data.session;
        if (typeof window !== 'undefined' && window.history.replaceState) {
          window.history.replaceState(null, '', window.location.pathname + window.location.search);
        }
      }

      if (session?.user) {
        await fetchUserProfile(session.user.id, session.user.email!);
      } else {
        setIsLoading(false);
      }
    };

    let initDone = false;
    const timeoutId = setTimeout(() => {
      if (initDone) return;
      initDone = true;
      console.warn('Auth init timeout – Supabase may be slow or unreachable. Showing app.');
      setIsLoading(false);
      setUser(null);
    }, AUTH_INIT_TIMEOUT_MS);

    initAuth()
      .finally(() => {
        initDone = true;
        clearTimeout(timeoutId);
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        fetchUserProfile(session.user.id, session.user.email!);
      } else {
        if (typeof window !== 'undefined') {
          localStorage.removeItem(SESSION_START_KEY);
          sessionStorage.removeItem(SESSION_START_KEY);
        }
        setUser(null);
        setIsLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Session timeout: idle (no activity) and absolute (max session length)
  useEffect(() => {
    if (!user || typeof window === 'undefined') return;

    lastActivityAt.current = Date.now();

    const onActivity = () => {
      lastActivityAt.current = Date.now();
    };
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'] as const;
    events.forEach((e) => window.addEventListener(e, onActivity));

    const intervalId = setInterval(() => {
      const storage = getAuthStorage();
      const started = storage.getItem(SESSION_START_KEY);
      if (!started) return;
      const sessionStart = parseInt(started, 10);
      const now = Date.now();
      if (now - sessionStart >= SESSION_ABSOLUTE_TIMEOUT_MS) {
        logoutRef.current();
        return;
      }
      if (now - lastActivityAt.current >= SESSION_IDLE_TIMEOUT_MS) {
        logoutRef.current();
        return;
      }
    }, SESSION_CHECK_INTERVAL_MS);

    return () => {
      events.forEach((e) => window.removeEventListener(e, onActivity));
      clearInterval(intervalId);
    };
  }, [user]);

  const login = async (email: string, password: string, rememberMe: boolean = true): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(REMEMBER_ME_KEY, rememberMe ? 'true' : 'false');
    }
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      console.error('Login error:', error.message);
      setIsLoading(false);
      return { success: false, error: error.message };
    }
    return { success: true };
  };

  const signup = async (email: string, password: string, name: string, phone: string, rememberMe: boolean = true, city?: string): Promise<{ success: boolean; error?: string; data?: any }> => {
    setIsLoading(true);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(REMEMBER_ME_KEY, rememberMe ? 'true' : 'false');
    }
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name: name,
          phone: phone,
          role: 'user',
          ...(city && { city })
        },
        emailRedirectTo: `${window.location.origin}/auth`
      }
    });
    if (error) {
      console.error('Signup error:', error.message);
      setIsLoading(false);
      return { success: false, error: error.message };
    }
    setIsLoading(false);
    return { success: true, data };
  };

  const resetPassword = async (email: string): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth?reset=true`,
    });

    setIsLoading(false);
    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  };

  const updateEmail = async (newEmail: string): Promise<{ success: boolean; error?: string }> => {
    if (!user?.email) return { success: false, error: 'Not signed in' };
    if (newEmail.trim().toLowerCase() === user.email.trim().toLowerCase()) {
      return { success: true };
    }
    const { error } = await supabase.auth.updateUser(
      { email: newEmail.trim().toLowerCase() },
      { emailRedirectTo: `${window.location.origin}/auth?email_changed=1` }
    );
    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  };

  const logout = async () => {
    setIsLoggingOut(true);
    try {
      await supabase.auth.signOut({ scope: 'local' });
      if (typeof window !== 'undefined') {
        try {
          const clearStorage = (storage: Storage) => {
            const keysToRemove: string[] = [];
            for (let i = 0; i < storage.length; i++) {
              const k = storage.key(i);
              if (k?.startsWith('sb-')) keysToRemove.push(k);
            }
            keysToRemove.forEach((k) => storage.removeItem(k));
            storage.removeItem(SESSION_START_KEY);
          };
          clearStorage(localStorage);
          clearStorage(sessionStorage);
          sessionStorage.clear();
        } catch (_) {}
      }
      setUser(null);
    } finally {
      setIsLoggingOut(false);
    }
  };

  const updateUser = async (userData: Partial<User>) => {
    if (!user) return;

    try {
      // Update local state optimistic
      setUser({ ...user, ...userData });

      // Update Profile Table
      if (userData.name || userData.phone || userData.address) {
        await supabase.from('profiles').update({
          full_name: userData.name,
          phone: userData.phone,
          address: userData.address
        }).eq('id', user.id);
      }

      // Update Subscription Table
      if (userData.subscription) {
        // NOTE: Complex subscription updates (plan changes, creation) should be handled 
        // via SubscriptionService to ensure data integrity with bucket_types and deliveries.
        // specific 'status' updates for pausing/cancelling can be done here or in service.

        // For now, we only update the status if explicitly provided and separate from plan creation
        if (userData.subscription.status && user.subscription?.id) {
          await supabase
            .from('subscriptions')
            .update({ status: userData.subscription.status })
            .eq('id', user.subscription.id);
        }

        // We do NOT create new subscriptions here anymore as it requires looking up bucket_type_id.
        // Use SubscriptionService.createSubscription() instead.
      }
    } catch (error) {
      console.error('Error updating user data:', error);
      // Ideally revert local state here on error
    }
  };

  const isAdmin = (): boolean => {
    return user?.role === 'admin';
  };

  logoutRef.current = logout;

  return (
    <AuthContext.Provider value={{
      user,
      login,
      signup,
      resetPassword,
      updateEmail,
      logout,
      isLoggingOut,
      updateUser,
      isLoading,
      isAdmin
    }}>
      {children}
    </AuthContext.Provider>
  );
};