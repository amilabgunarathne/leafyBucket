import React from 'react';
import { Mail, Phone, MapPin, Facebook, Twitter, Instagram } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const Footer = () => {
  const location = useLocation();
  const { user } = useAuth();

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, targetId: string) => {
    e.preventDefault();
    
    // If we're not on the home page, navigate to home first
    if (location.pathname !== '/') {
      window.location.href = `/#${targetId}`;
      return;
    }
    
    const targetElement = document.getElementById(targetId);
    if (targetElement) {
      const headerHeight = 80; // Account for fixed header
      const elementPosition = targetElement.offsetTop - headerHeight;
      
      window.scrollTo({
        top: elementPosition,
        behavior: 'smooth'
      });
    }
  };

  return (
    <footer className="bg-gray-900 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid lg:grid-cols-4 md:grid-cols-2 gap-8">
          <div className="space-y-6">
            <Link to="/" className="flex items-center">
              <img 
                src="/full_logo_light-removebg-preview.png" 
                alt="Leafy Bucket Logo" 
                className="h-12 w-auto object-contain"
              />
            </Link>
            <p className="text-gray-400 leading-relaxed">
              Delivering the freshest organic vegetables from local farms in Bandarawela to your doorstep every week. 
              Eat healthy, live better.
            </p>
            <div className="flex space-x-4">
              <a href="#" className="text-gray-400 hover:text-green-500 transition-colors">
                <Facebook className="h-6 w-6" />
              </a>
              <a href="#" className="text-gray-400 hover:text-green-500 transition-colors">
                <Twitter className="h-6 w-6" />
              </a>
              <a href="#" className="text-gray-400 hover:text-green-500 transition-colors">
                <Instagram className="h-6 w-6" />
              </a>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-6">Quick Links</h3>
            <ul className="space-y-3">
              <li>
                <a 
                  href="#how-it-works" 
                  onClick={(e) => handleNavClick(e, 'how-it-works')}
                  className="text-gray-400 hover:text-white transition-colors cursor-pointer"
                >
                  How It Works
                </a>
              </li>
              <li>
                <Link 
                  to="/shop"
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  Shop Now
                </Link>
              </li>
              <li>
                <Link 
                  to="/products"
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  What's Inside
                </Link>
              </li>
              {/* Only show Customize link for logged-in users */}
              {user && (
                <li>
                  <Link 
                    to="/customize"
                    className="text-gray-400 hover:text-white transition-colors"
                  >
                    Customize
                  </Link>
                </li>
              )}
              <li>
                <a 
                  href="#pricing" 
                  onClick={(e) => handleNavClick(e, 'pricing')}
                  className="text-gray-400 hover:text-white transition-colors cursor-pointer"
                >
                  Pricing
                </a>
              </li>
              <li>
                <a 
                  href="#testimonials" 
                  onClick={(e) => handleNavClick(e, 'testimonials')}
                  className="text-gray-400 hover:text-white transition-colors cursor-pointer"
                >
                  Reviews
                </a>
              </li>
              <li><a href="#" className="text-gray-400 hover:text-white transition-colors">FAQ</a></li>
            </ul>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-6">Support</h3>
            <ul className="space-y-3">
              <li><a href="#" className="text-gray-400 hover:text-white transition-colors">Contact Us</a></li>
              <li><a href="#" className="text-gray-400 hover:text-white transition-colors">Delivery Info</a></li>
              <li><a href="#" className="text-gray-400 hover:text-white transition-colors">Subscription Help</a></li>
              <li><a href="#" className="text-gray-400 hover:text-white transition-colors">Returns</a></li>
              <li><a href="#" className="text-gray-400 hover:text-white transition-colors">Privacy Policy</a></li>
            </ul>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-6">Contact Info</h3>
            <div className="space-y-3">
              <div className="flex items-center space-x-3">
                <Phone className="h-5 w-5 text-green-500" />
                <span className="text-gray-400">+94 77 123 4567</span>
              </div>
              <div className="flex items-center space-x-3">
                <Mail className="h-5 w-5 text-green-500" />
                <span className="text-gray-400">hello@leafybucket.lk</span>
              </div>
              <div className="flex items-center space-x-3">
                <MapPin className="h-5 w-5 text-green-500" />
                <span className="text-gray-400">Bandarawela, Sri Lanka</span>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-800 mt-12 pt-8">
          <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
            <p className="text-gray-400 text-sm">
              © 2024 Leafy Bucket. All rights reserved.
            </p>
            <div className="flex space-x-6 text-sm">
              <a href="#" className="text-gray-400 hover:text-white transition-colors">Terms of Service</a>
              <a href="#" className="text-gray-400 hover:text-white transition-colors">Privacy Policy</a>
              <a href="#" className="text-gray-400 hover:text-white transition-colors">Cookie Policy</a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;