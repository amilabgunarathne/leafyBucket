import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** Key used to choose persistent (localStorage) vs session-only (sessionStorage) auth. Set before login. */
export const REMEMBER_ME_KEY = 'leafy_remember_me';

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

const authStorage = {
  getItem(key: string): string | null {
    if (key === REMEMBER_ME_KEY) return localStorage.getItem(key);
    return getAuthStorage().getItem(key);
  },
  setItem(key: string, value: string): void {
    if (key === REMEMBER_ME_KEY) {
      localStorage.setItem(key, value);
      return;
    }
    getAuthStorage().setItem(key, value);
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
