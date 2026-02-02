import React, { useState } from 'react';
import { Plus, Minus, ShoppingCart, Star, Leaf, Package, ArrowLeft, TreePine, Flower, Filter, AlertCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import VegetableService from '../services/vegetableService';
import { supabase } from '../lib/supabase';
import PricingService from '../services/pricingService';

interface CartItem {
  id: string;
  name: string;
  pricePerUnit: number;
  quantity: number; // Number of 250g units
  totalWeight: number; // Total weight in grams
  image: string;
  category: string;
}

const ShopPage = () => {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'root' | 'leafy' | 'bushy'>('all');
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const vegetableService = VegetableService.getInstance();

  // Initialize vegetable service
  React.useEffect(() => {
    const initializeServices = async () => {
      try {
        await vegetableService.initialize();
        console.log('VegetableService initialized');
      } catch (error) {
        console.error('Failed to initialize VegetableService:', error);
      }
    };

    // DEBUG: Direct Supabase Fetch
    const debugSupabase = async () => {
      const { data, error } = await supabase.from('vegetables').select('*');
      console.log('DEBUG: Direct Supabase Fetch Result:', { data, error });
      if (error) console.error('Supabase Error Details:', error.message, error.details);
    };

    initializeServices();
    debugSupabase();
  }, []);

  // Listen for changes in vegetable data
  React.useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'admin_vegetables' || e.type === 'storage') {
        console.log('Vegetable data changed, refreshing...');
        setRefreshTrigger(prev => prev + 1);
      }
    };

    // Also listen for custom events
    const handleCustomRefresh = () => {
      console.log('Custom refresh triggered');
      setRefreshTrigger(prev => prev + 1);
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('vegetablesUpdated', handleCustomRefresh);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('vegetablesUpdated', handleCustomRefresh);
    };
  }, []);

  // Get products with market prices per 250g
  const productsWithPrices = React.useMemo(() => {
    const activeVegetables = vegetableService.getActiveVegetables();
    const pricingService = PricingService.getInstance();

    const products = activeVegetables.map(veg => ({
      ...veg,
      price: pricingService.getPrice(veg.id) || veg.marketPricePer250g, // Use dynamic price or fallback to default
      unit: '250g',
      minOrderQuantity: 250 // Minimum order quantity in grams
    }));

    console.log('Products with prices:', products.length);
    return products;
  }, [refreshTrigger]);


  // Filter products by category
  const filteredProducts = React.useMemo(() => {
    let filtered;

    if (selectedCategory === 'all') {
      filtered = productsWithPrices;
    } else {
      const categoryVegetables = vegetableService.getVegetablesByCategory(selectedCategory);
      filtered = categoryVegetables.filter(veg => veg.isAvailable).map(veg => {
        const pricing = productsWithPrices.find(p => p.id === veg.id);
        return pricing || { ...veg, price: veg.marketPricePer250g, unit: '250g', minOrderQuantity: 250 };
      });
    }

    console.log(`Filtered products for ${selectedCategory}:`, filtered.length);
    return filtered;
  }, [selectedCategory, productsWithPrices]);

  const addToCart = (product: typeof productsWithPrices[0]) => {
    setCart(prevCart => {
      const existingItem = prevCart.find(item => item.id === product.id);
      if (existingItem) {
        return prevCart.map(item =>
          item.id === product.id
            ? {
              ...item,
              quantity: item.quantity + 1,
              totalWeight: (item.quantity + 1) * 250
            }
            : item
        );
      } else {
        return [...prevCart, {
          id: product.id,
          name: product.name,
          pricePerUnit: product.price,
          quantity: 1, // 1 unit = 250g
          totalWeight: 250,
          image: product.image,
          category: product.category
        }];
      }
    });
  };

  const updateQuantity = (id: string, newQuantity: number) => {
    if (newQuantity === 0) {
      setCart(prevCart => prevCart.filter(item => item.id !== id));
    } else {
      setCart(prevCart =>
        prevCart.map(item =>
          item.id === id
            ? {
              ...item,
              quantity: newQuantity,
              totalWeight: newQuantity * 250
            }
            : item
        )
      );
    }
  };

  const getCartTotal = () => {
    return cart.reduce((total, item) => total + (item.pricePerUnit * item.quantity), 0);
  };

  const getCartItemCount = () => {
    return cart.reduce((total, item) => total + item.quantity, 0);
  };

  const getTotalWeight = () => {
    return cart.reduce((total, item) => total + item.totalWeight, 0);
  };

  const getItemQuantity = (productId: string) => {
    const item = cart.find(item => item.id === productId);
    return item ? item.quantity : 0;
  };

  // Get category icons and colors
  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'root': return TreePine;
      case 'leafy': return Leaf;
      case 'bushy': return Flower;
      default: return Package;
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'root': return 'text-orange-600 bg-orange-100';
      case 'leafy': return 'text-green-600 bg-green-100';
      case 'bushy': return 'text-purple-600 bg-purple-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getCategoryName = (category: string) => {
    switch (category) {
      case 'root': return 'Root & Tuber';
      case 'leafy': return 'Leafy Greens';
      case 'bushy': return 'Bushy & Fruit';
      default: return 'All Categories';
    }
  };

  return (
    <div className="pt-16">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-green-50 via-white to-orange-50 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center space-y-6">
            <Link
              to="/"
              className="inline-flex items-center space-x-2 text-green-600 hover:text-green-700 transition-colors mb-4"
            >
              <ArrowLeft className="h-5 w-5" />
              <span>Back to Home</span>
            </Link>

            <div className="flex items-center justify-center space-x-3 mb-6">
              <ShoppingCart className="h-10 w-10 text-green-600" />
              <h1 className="text-5xl lg:text-6xl font-bold text-gray-900 leading-tight">
                Shop Fresh
                <span className="text-green-600"> Vegetables</span>
              </h1>
            </div>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed">
              Choose exactly what you need from our fresh selection of organic vegetables.
              <span className="font-semibold text-green-700"> All prices shown per 250g</span> with minimum order quantities for practical handling.
            </p>
          </div>
        </div>
      </section>

      {/* Main Shopping Section */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Important Notice */}
          <div className="mb-8 bg-blue-50 border-2 border-blue-200 rounded-xl p-4">
            <div className="flex items-start space-x-3">
              <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="font-semibold text-blue-900 mb-1">Order Information</h4>
                <p className="text-sm text-blue-800">
                  All prices are per 250g. Minimum order quantity is 250g per vegetable for practical packaging and handling.
                  You can order multiple units (250g, 500g, 750g, etc.) of each vegetable.
                </p>
              </div>
            </div>
          </div>

          {/* Category Filter */}
          <div className="mb-8">
            <div className="flex items-center space-x-4 mb-6">
              <Filter className="h-5 w-5 text-gray-600" />
              <span className="font-medium text-gray-900">Filter by Category:</span>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => setSelectedCategory('all')}
                className={`px-4 py-2 rounded-full font-medium transition-colors ${selectedCategory === 'all'
                  ? 'bg-green-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-100'
                  }`}
              >
                All Categories
              </button>
              {['root', 'leafy', 'bushy'].map(category => {
                const Icon = getCategoryIcon(category);
                return (
                  <button
                    key={category}
                    onClick={() => setSelectedCategory(category as 'root' | 'leafy' | 'bushy')}
                    className={`px-4 py-2 rounded-full font-medium transition-colors flex items-center space-x-2 ${selectedCategory === category
                      ? 'bg-green-600 text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-100'
                      }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{getCategoryName(category)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Shopping Cart Button */}
          <div className="fixed top-24 md:top-28 right-4 z-40">
            <button
              onClick={() => setIsCartOpen(!isCartOpen)}
              className="bg-green-600 text-white p-4 rounded-full shadow-lg hover:bg-green-700 transition-all duration-200 relative"
            >
              <ShoppingCart className="h-6 w-6" />
              {getCartItemCount() > 0 && (
                <span className="absolute -top-2 -right-2 bg-orange-500 text-white text-xs rounded-full h-6 w-6 flex items-center justify-center font-bold">
                  {getCartItemCount()}
                </span>
              )}
            </button>
          </div>

          {/* Products Grid */}
          {filteredProducts.length === 0 ? (
            <div className="text-center py-16">
              <Package className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">No Vegetables Available</h3>
              <p className="text-gray-600 mb-6">
                {selectedCategory === 'all'
                  ? 'No vegetables are currently available for purchase.'
                  : `No ${getCategoryName(selectedCategory).toLowerCase()} vegetables are currently available.`
                }
              </p>
              <button
                onClick={() => setSelectedCategory('all')}
                className="text-green-600 hover:text-green-700 font-medium"
              >
                View All Categories
              </button>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-12">
              {filteredProducts.map((product) => {
                const CategoryIcon = getCategoryIcon(product.category);

                return (
                  <div key={product.id} className="bg-white rounded-2xl overflow-hidden shadow-lg hover:shadow-xl transition-all duration-300 group">
                    <div className="relative overflow-hidden">
                      <img
                        src={product.image}
                        alt={product.name}
                        className="w-full h-48 object-cover group-hover:scale-110 transition-transform duration-300"
                      />
                      <div className={`absolute top-3 left-3 px-2 py-1 rounded-full text-xs font-semibold flex items-center space-x-1 ${getCategoryColor(product.category)}`}>
                        <CategoryIcon className="h-3 w-3" />
                        <span>{getCategoryName(product.category)}</span>
                      </div>
                      <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-sm px-2 py-1 rounded-full">
                        <div className="flex items-center">
                          {[...Array(5)].map((_, i) => (
                            <Star key={i} className="h-3 w-3 text-yellow-400 fill-current" />
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="p-6">
                      <div className="mb-3">
                        <h3 className="text-lg font-semibold text-gray-900 mb-1">{product.name}</h3>
                        <p className="text-sm text-gray-600 leading-relaxed">{product.description}</p>
                      </div>

                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <span className="text-2xl font-bold text-green-600">LKR {product.price}</span>
                          <span className="text-sm text-gray-500 ml-1">/ 250g</span>
                        </div>
                        <div className="text-right">
                          <div className="flex items-center space-x-1 text-xs text-gray-500">
                            <Package className="h-3 w-3" />
                            <span>Min: 250g</span>
                          </div>
                        </div>
                      </div>

                      {/* Quantity selector or Add button */}
                      {getItemQuantity(product.id) === 0 ? (
                        <button
                          onClick={() => addToCart(product)}
                          className="w-full bg-green-600 text-white py-3 px-4 rounded-xl font-semibold hover:bg-green-700 transition-colors flex items-center justify-center space-x-2"
                        >
                          <Plus className="h-4 w-4" />
                          <span>Add 250g</span>
                        </button>
                      ) : (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between bg-green-50 rounded-xl p-2">
                            <button
                              onClick={() => updateQuantity(product.id, getItemQuantity(product.id) - 1)}
                              className="bg-white text-green-600 p-2 rounded-lg hover:bg-gray-50 transition-colors"
                            >
                              <Minus className="h-4 w-4" />
                            </button>
                            <div className="text-center">
                              <div className="font-semibold text-green-800">
                                {getItemQuantity(product.id)} units
                              </div>
                              <div className="text-xs text-green-600">
                                {getItemQuantity(product.id) * 250}g total
                              </div>
                            </div>
                            <button
                              onClick={() => updateQuantity(product.id, getItemQuantity(product.id) + 1)}
                              className="bg-white text-green-600 p-2 rounded-lg hover:bg-gray-50 transition-colors"
                            >
                              <Plus className="h-4 w-4" />
                            </button>
                          </div>
                          <div className="text-center text-sm text-gray-600">
                            Total: LKR {product.price * getItemQuantity(product.id)}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Shopping Cart Sidebar */}
          {isCartOpen && (
            <div className="fixed inset-0 z-50 overflow-hidden">
              <div className="absolute inset-0 bg-black bg-opacity-50" onClick={() => setIsCartOpen(false)}></div>
              <div className="absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-xl">
                <div className="flex flex-col h-full">
                  <div className="flex items-center justify-between p-6 border-b">
                    <h3 className="text-lg font-semibold text-gray-900">Shopping Cart</h3>
                    <button
                      onClick={() => setIsCartOpen(false)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      ×
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-6">
                    {cart.length === 0 ? (
                      <div className="text-center py-12">
                        <ShoppingCart className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                        <p className="text-gray-500">Your cart is empty</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {cart.map((item) => {
                          const CategoryIcon = getCategoryIcon(item.category);

                          return (
                            <div key={item.id} className="flex items-center space-x-4 bg-gray-50 rounded-xl p-4">
                              <img
                                src={item.image}
                                alt={item.name}
                                className="w-16 h-16 object-cover rounded-lg"
                              />
                              <div className="flex-1">
                                <div className="flex items-center space-x-2 mb-1">
                                  <h4 className="font-semibold text-gray-900 text-sm">{item.name}</h4>
                                  <CategoryIcon className={`h-3 w-3 ${getCategoryColor(item.category).split(' ')[0]}`} />
                                </div>
                                <p className="text-green-600 font-bold">LKR {item.pricePerUnit} / 250g</p>
                                <p className="text-xs text-gray-500">{item.totalWeight}g total</p>
                                <p className="text-xs text-green-600 font-medium">
                                  Subtotal: LKR {item.pricePerUnit * item.quantity}
                                </p>
                              </div>
                              <div className="flex items-center space-x-2">
                                <button
                                  onClick={() => updateQuantity(item.id, item.quantity - 1)}
                                  className="bg-white text-gray-600 p-1 rounded hover:bg-gray-100"
                                >
                                  <Minus className="h-3 w-3" />
                                </button>
                                <span className="font-semibold text-sm w-8 text-center">{item.quantity}</span>
                                <button
                                  onClick={() => updateQuantity(item.id, item.quantity + 1)}
                                  className="bg-white text-gray-600 p-1 rounded hover:bg-gray-100"
                                >
                                  <Plus className="h-3 w-3" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {cart.length > 0 && (
                    <div className="border-t p-6 space-y-4">
                      <div className="space-y-2">
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-gray-600">Total Weight:</span>
                          <span className="font-semibold">{getTotalWeight()}g</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-lg font-semibold text-gray-900">Total:</span>
                          <span className="text-2xl font-bold text-green-600">LKR {getCartTotal().toLocaleString()}</span>
                        </div>
                      </div>
                      <button className="w-full bg-green-600 text-white py-4 px-6 rounded-xl font-semibold hover:bg-green-700 transition-colors">
                        Proceed to Checkout
                      </button>
                      <p className="text-xs text-gray-500 text-center">
                        Free delivery on orders over LKR 1,500
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Benefits Section */}
          <div className="bg-white rounded-3xl p-8 shadow-lg">
            <div className="text-center mb-8">
              <h3 className="text-2xl font-bold text-gray-900 mb-4">Why Shop Individual Vegetables?</h3>
              <p className="text-gray-600">Perfect for those who prefer to choose exactly what they want at market prices</p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              <div className="text-center">
                <div className="bg-green-100 rounded-full p-4 inline-flex items-center justify-center mb-4">
                  <Package className="h-8 w-8 text-green-600" />
                </div>
                <h4 className="font-semibold text-gray-900 mb-2">250g Minimum Orders</h4>
                <p className="text-gray-600 text-sm">Practical packaging sizes for better handling and freshness</p>
              </div>
              <div className="text-center">
                <div className="bg-orange-100 rounded-full p-4 inline-flex items-center justify-center mb-4">
                  <Leaf className="h-8 w-8 text-orange-600" />
                </div>
                <h4 className="font-semibold text-gray-900 mb-2">Market Prices</h4>
                <p className="text-gray-600 text-sm">Fair pricing based on actual market rates per 250g</p>
              </div>
              <div className="text-center">
                <div className="bg-blue-100 rounded-full p-4 inline-flex items-center justify-center mb-4">
                  <ShoppingCart className="h-8 w-8 text-blue-600" />
                </div>
                <h4 className="font-semibold text-gray-900 mb-2">Flexible Shopping</h4>
                <p className="text-gray-600 text-sm">Order when you want, no subscription required</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default ShopPage;