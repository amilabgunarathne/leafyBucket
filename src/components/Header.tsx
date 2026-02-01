import React, { useState } from 'react';
import { Menu, X, User, Settings } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const Header = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const location = useLocation();
  const { user, isAdmin } = useAuth();

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, targetId: string) => {
    e.preventDefault();
    setIsMenuOpen(false); // Close mobile menu if open

    // If we're not on the home page, navigate to home first
    if (location.pathname !== '/') {
      window.location.href = `/#${targetId}`;
      return;
    }

    const targetElement = document.getElementById(targetId);
    if (targetElement) {
      const headerHeight = 100; // Account for fixed header
      const elementPosition = targetElement.offsetTop - headerHeight;

      window.scrollTo({
        top: elementPosition,
        behavior: 'smooth'
      });
    }
  };

  const handleStartSubscription = () => {
    setIsMenuOpen(false);
    if (user) {
      // User is logged in, go to subscription page
      window.location.href = '/subscription';
    } else {
      // User not logged in, go to auth page
      window.location.href = '/auth';
    }
  };

  return (
    <header className="fixed top-0 left-0 right-0 bg-white/95 backdrop-blur-sm z-50 border-b border-green-100">
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-20 md:h-24">
          <Link to="/" className="flex items-center">
            <img
              src="/full_logo_light-removebg-preview.png"
              alt="Leafy Bucket Logo"
              className="h-16 md:h-20 w-auto object-contain"
            />
          </Link>

          <div className="hidden md:flex items-center space-x-8">
            <a
              href="#how-it-works"
              onClick={(e) => handleNavClick(e, 'how-it-works')}
              className="text-gray-700 hover:text-green-600 transition-colors cursor-pointer"
            >
              How It Works
            </a>
            <Link
              to="/shop"
              className="text-gray-700 hover:text-green-600 transition-colors"
            >
              Shop Now
            </Link>
            <Link
              to="/products"
              className="text-gray-700 hover:text-green-600 transition-colors"
            >
              What's Inside
            </Link>
            <a
              href="#pricing"
              onClick={(e) => handleNavClick(e, 'pricing')}
              className="text-gray-700 hover:text-green-600 transition-colors cursor-pointer"
            >
              Pricing
            </a>
            <a
              href="#testimonials"
              onClick={(e) => handleNavClick(e, 'testimonials')}
              className="text-gray-700 hover:text-green-600 transition-colors cursor-pointer"
            >
              Reviews
            </a>

            {/* Admin Link - Only show for admin users */}
            {isAdmin() && (
              <Link
                to="/admin"
                className="text-orange-600 hover:text-orange-700 transition-colors flex items-center space-x-1"
                title="Admin Panel"
              >
                <Settings className="h-4 w-4" />
                <span className="text-sm font-medium">Admin</span>
              </Link>
            )}

            {user ? (
              <Link
                to="/subscription"
                className="flex items-center space-x-2 bg-green-600 text-white px-6 py-2 rounded-full hover:bg-green-700 transition-colors"
              >
                <User className="h-4 w-4" />
                <span>My Account</span>
              </Link>
            ) : (
              <button
                onClick={handleStartSubscription}
                className="bg-green-600 text-white px-6 py-2 rounded-full hover:bg-green-700 transition-colors"
              >
                Start Subscription
              </button>
            )}
          </div>

          <div className="md:hidden">
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="text-gray-700 hover:text-green-600 transition-colors"
            >
              {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>

        {isMenuOpen && (
          <div className="md:hidden">
            <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3 bg-white border-t border-green-100">
              <a
                href="#how-it-works"
                onClick={(e) => handleNavClick(e, 'how-it-works')}
                className="block px-3 py-2 text-gray-700 hover:text-green-600 transition-colors cursor-pointer"
              >
                How It Works
              </a>
              <Link
                to="/shop"
                className="block px-3 py-2 text-gray-700 hover:text-green-600 transition-colors"
                onClick={() => setIsMenuOpen(false)}
              >
                Shop Now
              </Link>
              <Link
                to="/products"
                className="block px-3 py-2 text-gray-700 hover:text-green-600 transition-colors"
                onClick={() => setIsMenuOpen(false)}
              >
                What's Inside
              </Link>
              <a
                href="#pricing"
                onClick={(e) => handleNavClick(e, 'pricing')}
                className="block px-3 py-2 text-gray-700 hover:text-green-600 transition-colors cursor-pointer"
              >
                Pricing
              </a>
              <a
                href="#testimonials"
                onClick={(e) => handleNavClick(e, 'testimonials')}
                className="block px-3 py-2 text-gray-700 hover:text-green-600 transition-colors cursor-pointer"
              >
                Reviews
              </a>

              {/* Admin Link for Mobile - Only show for admin users */}
              {isAdmin() && (
                <Link
                  to="/admin"
                  className="block px-3 py-2 text-orange-600 hover:text-orange-700 transition-colors font-medium"
                  onClick={() => setIsMenuOpen(false)}
                >
                  Admin Panel
                </Link>
              )}

              {user ? (
                <Link
                  to="/subscription"
                  className="block w-full mt-2 bg-green-600 text-white px-6 py-2 rounded-full hover:bg-green-700 transition-colors text-center"
                  onClick={() => setIsMenuOpen(false)}
                >
                  My Account
                </Link>
              ) : (
                <button
                  onClick={handleStartSubscription}
                  className="w-full mt-2 bg-green-600 text-white px-6 py-2 rounded-full hover:bg-green-700 transition-colors"
                >
                  Start Subscription
                </button>
              )}
            </div>
          </div>
        )}
      </nav>
    </header>
  );
};

export default Header;