import React, { useEffect } from 'react';
import { Routes, Route, useLocation, Navigate } from 'react-router-dom';
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
import AdminLoginPage from './pages/AdminLoginPage';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function AppLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const isAdminArea = location.pathname.startsWith('/manage');

  return (
    <div className="min-h-screen">
      {!isAdminArea && <Header />}
      {children}
      {!isAdminArea && <Footer />}
    </div>
  );
}

function App() {
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
        <AppLayout>
          <ScrollToTop />
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
            {/* Admin: secret URL — not linked from public site */}
            <Route path="/manage" element={<AdminLoginPage />} />
            <Route
              path="/manage/dashboard"
              element={
                <AdminProtectedRoute>
                  <AdminPage />
                </AdminProtectedRoute>
              }
            />
            {/* Legacy /admin redirects to new admin dashboard */}
            <Route path="/admin" element={<Navigate to="/manage/dashboard" replace />} />
          </Routes>
        </AppLayout>
      </WeeklyProvider>
    </AuthProvider>
  );
}

export default App;