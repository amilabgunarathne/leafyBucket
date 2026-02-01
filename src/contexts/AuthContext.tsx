import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface User {
  id: string;
  email: string;
  name: string;
  phone?: string;
  address?: string;
  role: 'user' | 'admin';
  subscription?: {
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
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signup: (email: string, password: string, name: string) => Promise<{ success: boolean; error?: string; data?: any }>;
  logout: () => void;
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

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Helper to fetch full user profile and subscription
  const fetchUserProfile = async (userId: string, email: string) => {
    try {
      // 1. Fetch Profile
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (profileError) throw profileError;

      // 2. Fetch Subscription
      const { data: subscription, error: subError } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      // Construct User Object
      const userData: User = {
        id: userId,
        email: email,
        name: profile.full_name || email.split('@')[0],
        phone: profile.phone || '',
        address: profile.address || '',
        role: profile.role || 'user',
        subscription: subscription ? {
          plan: subscription.plan,
          status: subscription.status,
          nextDelivery: subscription.next_delivery,
          customizations: subscription.customizations || {
            excludedVegetables: [],
            removedVegetables: [],
            addedVegetables: [],
            deliveryDay: 'sunday'
          }
        } : undefined
      };

      setUser(userData);
    } catch (error) {
      console.error('Error fetching user profile:', error);
      // Fallback for new users who might not have a profile trigger running yet? 
      // Should be handled by DB trigger, but just in case:
      setUser({
        id: userId,
        email: email,
        name: 'User',
        role: 'user'
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Check active session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        fetchUserProfile(session.user.id, session.user.email!);
      } else {
        setIsLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        fetchUserProfile(session.user.id, session.user.email!);
      } else {
        setUser(null);
        setIsLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true);
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

  const signup = async (email: string, password: string, name: string): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name: name,
          role: 'user' // Default role
        }
      }
    });

    if (error) {
      console.error('Signup error:', error.message);
      setIsLoading(false);
      return { success: false, error: error.message };
    }

    if (data.user) {
      // Profile creation is handled by Supabase Trigger (in schema.sql)
      return { success: true };
    }

    return { success: false, error: 'Sign up failed unexpectedly' };
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
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
        // Check if subscription exists first
        const { data: existingSub } = await supabase
          .from('subscriptions')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();

        const subData = {
          user_id: user.id,
          plan: userData.subscription.plan,
          status: userData.subscription.status,
          next_delivery: userData.subscription.nextDelivery,
          customizations: userData.subscription.customizations
        };

        if (existingSub) {
          await supabase.from('subscriptions').update(subData).eq('user_id', user.id);
        } else {
          // Create new subscription if not exists
          await supabase.from('subscriptions').insert(subData);
        }
      }
    } catch (error) {
      console.error('Error updating user data:', error);
      // Ideally revert local state here on error
    }
  };

  const isAdmin = (): boolean => {
    return user?.role === 'admin';
  };

  return (
    <AuthContext.Provider value={{
      user,
      login,
      signup,
      logout,
      updateUser,
      isLoading,
      isAdmin
    }}>
      {children}
    </AuthContext.Provider>
  );
};