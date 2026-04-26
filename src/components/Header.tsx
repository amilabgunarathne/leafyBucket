import React, { useState, useRef, useEffect } from 'react';
import { Menu, X, User, ChevronDown, LogOut } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useCustomizationLeaveInterceptor } from '../hooks/useCustomizationLeaveInterceptor';

const Header = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { interceptLeave } = useCustomizationLeaveInterceptor();

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    if (isUserMenuOpen) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [isUserMenuOpen]);

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, targetId: string) => {
    e.preventDefault();
    setIsMenuOpen(false);

    if (interceptLeave({ pathname: '/', state: { scrollToSection: targetId } })) {
      return;
    }

    if (location.pathname !== '/') {
      navigate('/', { state: { scrollToSection: targetId } });
      return;
    }

    const targetElement = document.getElementById(targetId);
    if (targetElement) {
      const headerHeight = 100;
      const elementPosition = targetElement.offsetTop - headerHeight;
      window.scrollTo({ top: elementPosition, behavior: 'smooth' });
    }
  };

  const handleStartSubscription = () => {
    setIsMenuOpen(false);
    if (user) {
      if (interceptLeave('/my-bucket')) return;
      navigate('/my-bucket');
    } else {
      navigate('/auth');
    }
  };

  return (
    <header className="fixed top-0 left-0 right-0 bg-white/95 backdrop-blur-sm z-50 border-b border-green-100">
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-20 md:h-24">
          <Link
            to="/"
            onClick={(e) => {
              if (interceptLeave('/')) e.preventDefault();
            }}
            className="flex items-center"
          >
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
            <Link
              to="/products"
              onClick={(e) => {
                if (interceptLeave('/products')) e.preventDefault();
              }}
              className="text-gray-700 hover:text-green-600 transition-colors"
            >
              Discover
            </Link>
            <Link
              to="/shop"
              onClick={(e) => {
                if (interceptLeave('/shop')) e.preventDefault();
              }}
              className="text-gray-700 hover:text-green-600 transition-colors"
            >
              Shop Now
            </Link>
            {user ? (
              <Link
                to="/my-bucket"
                onClick={(e) => {
                  if (interceptLeave('/my-bucket')) e.preventDefault();
                }}
                className="bg-green-600 text-white px-6 py-2 rounded-full hover:bg-green-700 transition-colors"
              >
                My Bucket
              </Link>
            ) : null}

            {user ? (
              <div className="relative" ref={userMenuRef}>
                <button
                  type="button"
                  onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                  className="flex items-center space-x-2 text-gray-700 hover:text-green-600 transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-1 rounded-full"
                >
                  <span className="font-medium max-w-[120px] truncate">{user.name || 'Account'}</span>
                  <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${isUserMenuOpen ? 'rotate-180' : ''}`} />
                  <div className="w-9 h-9 rounded-full bg-green-600 text-white flex items-center justify-center font-semibold text-sm shrink-0">
                    {(user.name || user.email || 'U').charAt(0).toUpperCase()}
                  </div>
                </button>
                {isUserMenuOpen && (
                  <div className="absolute left-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-gray-200 py-1 z-50">
                    <Link
                      to="/profile"
                      onClick={(e) => {
                        if (interceptLeave('/profile')) {
                          e.preventDefault();
                          return;
                        }
                        setIsUserMenuOpen(false);
                        setIsMenuOpen(false);
                      }}
                      className="flex items-center space-x-2 px-4 py-3 text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <User className="h-4 w-4 text-gray-500" />
                      <span>Profile</span>
                    </Link>
                    <div className="border-t border-gray-100 my-1" />
                    <button
                      type="button"
                      onClick={() => { setIsUserMenuOpen(false); logout(); }}
                      className="flex items-center space-x-2 w-full px-4 py-3 text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <LogOut className="h-4 w-4" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Link
                to="/auth"
                onClick={(e) => {
                  if (interceptLeave('/auth')) e.preventDefault();
                }}
                className="bg-green-600 text-white px-6 py-2 rounded-full hover:bg-green-700 transition-colors inline-block"
              >
                Select Bucket Size
              </Link>
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
              <Link
                to="/products"
                className="block px-3 py-2 text-gray-700 hover:text-green-600 transition-colors"
                onClick={(e) => {
                  if (interceptLeave('/products')) {
                    e.preventDefault();
                    return;
                  }
                  setIsMenuOpen(false);
                }}
              >
                Discover
              </Link>
              <Link
                to="/shop"
                className="block px-3 py-2 text-gray-700 hover:text-green-600 transition-colors"
                onClick={(e) => {
                  if (interceptLeave('/shop')) {
                    e.preventDefault();
                    return;
                  }
                  setIsMenuOpen(false);
                }}
              >
                Shop Now
              </Link>

              {user ? (
                <>
                  <Link
                    to="/my-bucket"
                    className="block w-full mt-2 bg-green-600 text-white px-6 py-2 rounded-full hover:bg-green-700 transition-colors text-center"
                    onClick={(e) => {
                      if (interceptLeave('/my-bucket')) {
                        e.preventDefault();
                        return;
                      }
                      setIsMenuOpen(false);
                    }}
                  >
                    My Bucket
                  </Link>
                  <Link
                    to="/profile"
                    className="block px-3 py-2 text-gray-700 hover:text-green-600 transition-colors"
                    onClick={(e) => {
                      if (interceptLeave('/profile')) {
                        e.preventDefault();
                        return;
                      }
                      setIsMenuOpen(false);
                    }}
                  >
                    Profile
                  </Link>
                  <button
                    type="button"
                    onClick={() => { setIsMenuOpen(false); logout(); }}
                    className="block w-full text-left px-3 py-2 text-red-600 hover:bg-red-50 transition-colors"
                  >
                    Sign Out
                  </button>
                </>
              ) : (
                <button
                  onClick={handleStartSubscription}
                  className="w-full mt-2 bg-green-600 text-white px-6 py-2 rounded-full hover:bg-green-700 transition-colors"
                >
                  Select Bucket Size
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