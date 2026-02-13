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
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signup: (email: string, password: string, name: string, phone: string) => Promise<{ success: boolean; error?: string; data?: any }>;
  resetPassword: (email: string) => Promise<{ success: boolean; error?: string }>;
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

      // 2. Fetch Latest Active Subscription
      const { data: subscription } = await supabase
        .from('subscriptions')
        .select('*, bucket_type:bucket_types(*)')
        .eq('user_id', userId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
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
          id: subscription.id,
          plan: mapBucketTypeToPlan(subscription.bucket_type?.name),
          status: subscription.status,
          nextDelivery: subscription.next_delivery || new Date().toISOString(), // Fallback
          // MOCK: Customizations (need to fetch from customisation_actions eventually)
          customizations: {
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

      // Fallback: Try to get name from session metadata if available, otherwise email
      let fallbackName = 'User';
      const { data } = await supabase.auth.getUser();
      if (data.user?.user_metadata?.name) {
        fallbackName = data.user.user_metadata.name;
      } else if (email) {
        fallbackName = email.split('@')[0];
      }

      setUser({
        id: userId,
        email: email,
        name: fallbackName,
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

  const signup = async (email: string, password: string, name: string, phone: string): Promise<{ success: boolean; error?: string; data?: any }> => {
    setIsLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name: name,
          phone: phone,
          role: 'user' // Default role
        }
      }
    });

    if (error) {
      console.error('Signup error:', error.message);
      setIsLoading(false);
      return { success: false, error: error.message };
    }

    // Success response always returns data, but session might be null if email confirmation is on
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

  return (
    <AuthContext.Provider value={{
      user,
      login,
      signup,
      resetPassword,
      logout,
      updateUser,
      isLoading,
      isAdmin
    }}>
      {children}
    </AuthContext.Provider>
  );
};