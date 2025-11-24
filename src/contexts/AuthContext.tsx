import React, { createContext, useContext, useState, useEffect } from 'react';

interface User {
  id: string;
  email: string;
  name: string;
  phone?: string;
  address?: string;
  role: 'user' | 'admin'; // Add role field
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
  login: (email: string, password: string) => Promise<boolean>;
  signup: (email: string, password: string, name: string) => Promise<boolean>;
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

  // Mock users database with admin accounts
  const mockUsers = [
    {
      id: '1',
      email: 'demo@leafybucket.lk',
      password: 'demo123',
      name: 'Demo User',
      role: 'user' as const,
      phone: '+94 77 123 4567',
      address: 'Colombo, Sri Lanka',
      subscription: {
        plan: 'medium' as const,
        status: 'active' as const,
        nextDelivery: '2024-01-07',
        customizations: {
          excludedVegetables: ['karavila'],
          removedVegetables: [],
          addedVegetables: ['radish'],
          deliveryDay: 'sunday'
        }
      }
    },
    {
      id: '2',
      email: 'admin@leafybucket.lk',
      password: 'admin123',
      name: 'Admin User',
      role: 'admin' as const,
      phone: '+94 77 999 8888',
      address: 'Bandarawela, Sri Lanka'
    },
    {
      id: '3',
      email: 'superadmin@leafybucket.lk',
      password: 'super123',
      name: 'Super Admin',
      role: 'admin' as const,
      phone: '+94 77 000 1111',
      address: 'Bandarawela, Sri Lanka'
    }
  ];

  useEffect(() => {
    // Check for stored user session
    const storedUser = localStorage.getItem('leafybucket_user');
    if (storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);
        // Ensure role exists (for backward compatibility)
        if (!parsedUser.role) {
          parsedUser.role = 'user';
        }
        setUser(parsedUser);
      } catch (error) {
        console.error('Error parsing stored user:', error);
        localStorage.removeItem('leafybucket_user');
      }
    }
    setIsLoading(false);
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    setIsLoading(true);
    
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const foundUser = mockUsers.find(u => u.email === email && u.password === password);
    
    if (foundUser) {
      const { password: _, ...userWithoutPassword } = foundUser;
      setUser(userWithoutPassword);
      localStorage.setItem('leafybucket_user', JSON.stringify(userWithoutPassword));
      setIsLoading(false);
      return true;
    }
    
    setIsLoading(false);
    return false;
  };

  const signup = async (email: string, password: string, name: string): Promise<boolean> => {
    setIsLoading(true);
    
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Check if user already exists
    const existingUser = mockUsers.find(u => u.email === email);
    if (existingUser) {
      setIsLoading(false);
      return false;
    }
    
    // Create new user (always as regular user, not admin)
    const newUser = {
      id: Date.now().toString(),
      email,
      name,
      role: 'user' as const,
      phone: '',
      address: ''
    };
    
    setUser(newUser);
    localStorage.setItem('leafybucket_user', JSON.stringify(newUser));
    setIsLoading(false);
    return true;
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('leafybucket_user');
  };

  const updateUser = (userData: Partial<User>) => {
    if (user) {
      const updatedUser = { ...user, ...userData };
      setUser(updatedUser);
      localStorage.setItem('leafybucket_user', JSON.stringify(updatedUser));
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