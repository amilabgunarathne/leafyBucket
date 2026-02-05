import { ArrowRight, Truck, Clock, Leaf, Settings, ShoppingCart } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Link } from 'react-router-dom';

const Hero = () => {
  const { user } = useAuth();

  const handleStartSubscription = () => {
    if (user) {
      // User is logged in, go to subscription page
      window.location.href = '/subscription';
    } else {
      // User not logged in, go to auth page
      window.location.href = '/auth';
    }
  };

  return (
    <section className="pt-16 bg-gradient-to-br from-green-50 via-white to-orange-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-8">
            <div className="space-y-4">
              <h1 className="text-5xl lg:text-6xl font-bold text-gray-900 leading-tight">
                Farm-fresh vegetables, at
                <span className="text-green-600"> Your Door</span> every week
              </h1>
              <p className="text-xl text-gray-600 leading-relaxed">
                Get the freshest, up country vegetables delivered to your door every week.
                <span className="font-semibold text-green-700"> Customize your Leafy Bucket</span> with our easy monthly subscription, or simply shop individual items and add them to your cart.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <button
                onClick={handleStartSubscription}
                className="bg-green-600 text-white px-8 py-4 rounded-full text-lg font-semibold hover:bg-green-700 transform hover:scale-105 transition-all duration-200 flex items-center justify-center space-x-2"
              >
                <span>{user ? 'Manage Subscription' : 'Select Bucket Size'}</span>
                <ArrowRight className="h-5 w-5" />
              </button>
              <Link
                to="/shop"
                className="border-2 border-green-600 text-green-600 px-8 py-4 rounded-full text-lg font-semibold hover:bg-green-50 transition-colors text-center flex items-center justify-center space-x-2"
              >
                <span>Shop Individually</span>
                <ShoppingCart className="h-5 w-5" />
              </Link>
            </div>

            <div className="flex items-center space-x-8 pt-4">
              <div className="flex items-center space-x-2 text-gray-600">
                <Truck className="h-5 w-5 text-green-600" />
                <span className="text-sm">Free delivery</span>
              </div>
              <div className="flex items-center space-x-2 text-gray-600">
                <Clock className="h-5 w-5 text-green-600" />
                <span className="text-sm">Weekly delivery</span>
              </div>
              <div className="flex items-center space-x-2 text-gray-600">
                <Settings className="h-5 w-5 text-green-600" />
                <span className="text-sm">Fully customizable</span>
              </div>
              <div className="flex items-center space-x-2 text-gray-600">
                <Leaf className="h-5 w-5 text-green-600" />
                <span className="text-sm">100% fresh</span>
              </div>
            </div>
          </div>

          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-green-400 to-orange-400 rounded-3xl transform rotate-3 opacity-20"></div>
            <img
              src="https://images.pexels.com/photos/1132047/pexels-photo-1132047.jpeg?auto=compress&cs=tinysrgb&w=800"
              alt="Fresh vegetable bucket"
              className="relative rounded-3xl shadow-2xl w-full h-auto object-cover"
            />
            <div className="absolute -bottom-6 -left-6 bg-white p-4 rounded-2xl shadow-lg">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">15+</div>
                <div className="text-sm text-gray-600">Fresh vegetables</div>
              </div>
            </div>
            <div className="absolute -top-6 -right-6 bg-white p-4 rounded-2xl shadow-lg">
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-600">100%</div>
                <div className="text-sm text-gray-600">Customizable</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;