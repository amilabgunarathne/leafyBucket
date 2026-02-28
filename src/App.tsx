import React, { useEffect } from 'react';
import { Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
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
  const location = useLocation();
  const { pathname, hash } = location;
  const state = location.state as { scrollToSection?: string } | null;
  const sectionId = state?.scrollToSection || (hash ? hash.replace(/^#/, '') : null);

  useEffect(() => {
    if (pathname !== '/') {
      window.scrollTo(0, 0);
      return;
    }

    if (sectionId) {
      window.scrollTo(0, 0);
      const headerOffset = 100;
      const doScroll = () => {
        const el = document.getElementById(sectionId);
        if (el) {
          const scrollTop = el.getBoundingClientRect().top + window.scrollY - headerOffset;
          window.scrollTo({ top: Math.max(0, scrollTop), behavior: 'smooth' });
          if (window.history.replaceState) {
            window.history.replaceState(null, '', `/#${sectionId}`);
          }
          return true;
        }
        return false;
      };
      const t = setTimeout(() => doScroll(), 300);
      return () => clearTimeout(t);
    }

    window.scrollTo(0, 0);
  }, [pathname, sectionId]);

  return null;
}

function AppLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { isLoggingOut } = useAuth();
  const isAdminArea = location.pathname.startsWith('/manage');

  return (
    <div className="min-h-screen">
      {isLoggingOut && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl p-8 flex flex-col items-center gap-4 shadow-xl">
            <Loader2 className="h-12 w-12 animate-spin text-green-600" />
            <p className="text-gray-700 font-medium">Signing out...</p>
          </div>
        </div>
      )}
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
              path="/my-account"
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