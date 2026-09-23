import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** Key used to choose persistent (localStorage) vs session-only (sessionStorage) auth. Set before login. */
export const REMEMBER_ME_KEY = 'leafy_remember_me';

function getPreferredAuthStorage(): Storage {
  if (typeof window === 'undefined') return localStorage;
  try {
    const raw = localStorage.getItem(REMEMBER_ME_KEY);
    const remember = raw === null || raw === 'true';
    return remember ? localStorage : sessionStorage;
  } catch {
    return localStorage;
  }
}

/**
 * Custom storage must find the session even if Remember-me preference flipped
 * between logins (session ended up in the other Storage). Writes always go to
 * the preferred store; reads check preferred first, then the other.
 */
const authStorage = {
  getItem(key: string): string | null {
    if (typeof window === 'undefined') return null;
    if (key === REMEMBER_ME_KEY) return localStorage.getItem(key);
    try {
      const preferred = getPreferredAuthStorage();
      const other = preferred === localStorage ? sessionStorage : localStorage;
      return preferred.getItem(key) ?? other.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string): void {
    if (typeof window === 'undefined') return;
    if (key === REMEMBER_ME_KEY) {
      localStorage.setItem(key, value);
      return;
    }
    try {
      const preferred = getPreferredAuthStorage();
      const other = preferred === localStorage ? sessionStorage : localStorage;
      preferred.setItem(key, value);
      // Avoid stale session in the other store after preference change.
      other.removeItem(key);
    } catch {
      // ignore
    }
  },
  removeItem(key: string): void {
    try {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    } catch (_) {}
  },
};

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Missing Supabase environment variables. Please check your .env file.');
} else {
  console.log('Supabase Initializing with URL:', supabaseUrl);
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '', {
  auth: {
    storage: authStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
