import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { WeeklyProvider } from './contexts/WeeklyContext';
import VegetableService from './services/vegetableService';
import Header from './components/Header';
import Footer from './components/Footer';
import ProtectedRoute from './components/ProtectedRoute';
import AdminProtectedRoute from './components/AdminProtectedRoute';
import HomePage from './pages/HomePage';
import ProductsPage from './pages/ProductsPage';
import CustomizationPage from './pages/CustomizationPage';
import ShopPage from './pages/ShopPage';
import AuthPage from './pages/AuthPage';
import SubscriptionPage from './pages/SubscriptionPage';
import AdminPage from './pages/AdminPage';

function App() {
  // Initialize vegetable service
  React.useEffect(() => {
    const initializeServices = async () => {
      try {
        const vegetableService = VegetableService.getInstance();
        await vegetableService.initialize();
        console.log('Services initialized successfully');
      } catch (error) {
        console.error('Failed to initialize services:', error);
      }
    };
    
    initializeServices();
  }, []);

  return (
    <AuthProvider>
      <WeeklyProvider>
        <div className="min-h-screen">
          <Header />
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/products" element={<ProductsPage />} />
            <Route 
              path="/customize" 
              element={
                <ProtectedRoute>
                  <CustomizationPage />
                </ProtectedRoute>
              } 
            />
            <Route path="/shop" element={<ShopPage />} />
            <Route path="/auth" element={<AuthPage />} />
            <Route 
              path="/subscription" 
              element={
                <ProtectedRoute>
                  <SubscriptionPage />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/admin" 
              element={
                <AdminProtectedRoute>
                  <AdminPage />
                </AdminProtectedRoute>
              } 
            />
          </Routes>
          <Footer />
        </div>
      </WeeklyProvider>
    </AuthProvider>
  );
}

export default App;