import React, { useState } from 'react';
import { ArrowLeft, Package, Settings, User, Edit3, MapPin, Phone, Mail, Pause, Play, Check, Calendar, Clock, Truck, Leaf } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import ConfirmationModal from '../components/ConfirmationModal';
import VegetableService from '../services/vegetableService';

const SubscriptionPage = () => {
  const { user, updateUser, logout } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('overview');
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileData, setProfileData] = useState({
    name: user?.name || '',
    phone: user?.phone || '',
    address: user?.address || ''
  });

  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<'pause' | 'resume' | null>(null);

  // Redirect if not logged in
  React.useEffect(() => {
    if (!user) {
      navigate('/auth', { state: { from: { pathname: '/subscription' } } });
    }
  }, [user, navigate]);

  if (!user) {
    return null;
  }

  const handleProfileUpdate = () => {
    updateUser(profileData);
    setIsEditingProfile(false);
  };

  const handleStartSubscription = (plan: 'small' | 'medium' | 'large') => {
    const nextDelivery = new Date();
    nextDelivery.setDate(nextDelivery.getDate() + 7);

    updateUser({
      subscription: {
        plan,
        status: 'active',
        nextDelivery: nextDelivery.toISOString().split('T')[0],
        customizations: {
          excludedVegetables: [],
          removedVegetables: [],
          addedVegetables: [],
          deliveryDay: 'sunday'
        }
      }
    });
    setActiveTab('overview');
  };

  const toggleSubscriptionStatus = () => {
    if (user.subscription) {
      const isPaused = user.subscription.status === 'paused';
      setPendingAction(isPaused ? 'resume' : 'pause');
      setIsConfirmModalOpen(true);
    }
  };

  const handleConfirmStatusChange = () => {
    if (user.subscription && pendingAction) {
      updateUser({
        subscription: {
          ...user.subscription,
          status: pendingAction === 'pause' ? 'paused' : 'active'
        }
      });
      setPendingAction(null);
    }
  };

  const plans = [
    {
      id: 'small',
      name: 'Small Family',
      price: 2900,
      description: 'Perfect for 1-2 people',
      vegetables: 4,
      weight: '1.5-2 kg'
    },
    {
      id: 'medium',
      name: 'Medium Family',
      price: 4900,
      description: 'Great for 3-4 people',
      vegetables: 7,
      weight: '3-4 kg'
    },
    {
      id: 'large',
      name: 'Large Family',
      price: 6900,
      description: 'Ideal for 5+ people',
      vegetables: 10,
      weight: '5-6 kg'
    }
  ];

  const currentPlan = plans.find(p => p.id === user.subscription?.plan);

  const [vegetables, setVegetables] = useState<{ id: string, name: string, weight: string }[]>([]);
  const vegetableService = VegetableService.getInstance();

  React.useEffect(() => {
    const fetchVegetables = async () => {
      await vegetableService.initialize();
      const allVegetables = vegetableService.getAllVegetables();
      const formattedVegetables = allVegetables.map(v => ({
        id: v.id,
        name: v.name,
        weight: v.typicalWeight
      }));
      setVegetables(formattedVegetables);
    };
    fetchVegetables();
  }, []);

  return (
    <div className="pt-24 min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Link
                to="/"
                className="flex items-center space-x-2 text-green-600 hover:text-green-700 transition-colors"
              >
                <ArrowLeft className="h-5 w-5" />
                <span>Back to Home</span>
              </Link>
              <div className="h-6 w-px bg-gray-300"></div>
              <h1 className="text-2xl font-bold text-gray-900">My Account</h1>
            </div>

            <div className="flex items-center space-x-4">
              <div className="text-right">
                <div className="text-sm text-gray-600">Welcome back,</div>
                <div className="font-semibold text-gray-900">{user.name}</div>
              </div>
              <button
                onClick={logout}
                className="text-gray-600 hover:text-gray-800 transition-colors"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid lg:grid-cols-4 gap-8">
          {/* Sidebar Navigation */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-2xl shadow-lg p-6 sticky top-8">
              <nav className="space-y-2">
                <button
                  onClick={() => setActiveTab('overview')}
                  className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-left transition-colors ${activeTab === 'overview' ? 'bg-green-100 text-green-800' : 'text-gray-600 hover:bg-gray-100'
                    }`}
                >
                  <Package className="h-5 w-5" />
                  <span>Overview</span>
                </button>

                <button
                  onClick={() => setActiveTab('profile')}
                  className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-left transition-colors ${activeTab === 'profile' ? 'bg-green-100 text-green-800' : 'text-gray-600 hover:bg-gray-100'
                    }`}
                >
                  <User className="h-5 w-5" />
                  <span>Profile</span>
                </button>

                {/* Quick Actions */}
                <div className="pt-4 border-t border-gray-200 mt-4">
                  <h4 className="text-sm font-medium text-gray-700 mb-3">Quick Actions</h4>
                  <div className="space-y-2">
                    <Link
                      to="/customize"
                      className="w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-left transition-colors text-gray-600 hover:bg-gray-100"
                    >
                      <Settings className="h-5 w-5" />
                      <span>Customize Bucket</span>
                    </Link>
                  </div>
                </div>
              </nav>
            </div>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3">
            {/* Overview Tab */}
            {activeTab === 'overview' && (
              <div className="space-y-8">
                {!user.subscription ? (
                  /* No Subscription - Plan Selection */
                  <div className="bg-white rounded-3xl shadow-lg p-8">
                    <div className="text-center mb-8">
                      <h2 className="text-3xl font-bold text-gray-900 mb-4">Choose Your Leafy Bucket Plan</h2>
                      <p className="text-gray-600">Start your journey to healthier eating with fresh vegetables delivered weekly</p>
                    </div>

                    <div className="grid md:grid-cols-3 gap-6">
                      {plans.map((plan) => (
                        <div key={plan.id} className={`border-2 rounded-2xl p-6 transition-all hover:shadow-lg ${plan.id === 'medium' ? 'border-green-600 bg-green-50' : 'border-gray-200'
                          }`}>
                          {plan.id === 'medium' && (
                            <div className="text-center mb-4">
                              <span className="bg-green-600 text-white px-3 py-1 rounded-full text-sm font-semibold">
                                Most Popular
                              </span>
                            </div>
                          )}

                          <div className="text-center mb-6">
                            <h3 className="text-xl font-bold text-gray-900 mb-2">{plan.name}</h3>
                            <p className="text-gray-600 mb-4">{plan.description}</p>
                            <div className="text-3xl font-bold text-green-600 mb-2">
                              LKR {plan.price.toLocaleString()}
                            </div>
                            <div className="text-sm text-gray-600">per month</div>
                          </div>

                          <div className="space-y-3 mb-6">
                            <div className="flex items-center space-x-2">
                              <Check className="h-4 w-4 text-green-600" />
                              <span className="text-sm">{plan.vegetables} varieties of vegetables</span>
                            </div>
                            <div className="flex items-center space-x-2">
                              <Check className="h-4 w-4 text-green-600" />
                              <span className="text-sm">{plan.weight} of fresh produce</span>
                            </div>
                            <div className="flex items-center space-x-2">
                              <Check className="h-4 w-4 text-green-600" />
                              <span className="text-sm">Weekly delivery</span>
                            </div>
                            <div className="flex items-center space-x-2">
                              <Check className="h-4 w-4 text-green-600" />
                              <span className="text-sm">Free delivery</span>
                            </div>
                          </div>

                          <button
                            onClick={() => handleStartSubscription(plan.id as 'small' | 'medium' | 'large')}
                            className={`w-full py-3 px-6 rounded-xl font-semibold transition-colors ${plan.id === 'medium'
                              ? 'bg-green-600 text-white hover:bg-green-700'
                              : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                              }`}
                          >
                            Select Bucket Size
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  /* Active Subscription Overview */
                  <>
                    {/* Subscription Status */}
                    <div className="bg-white rounded-3xl shadow-lg p-8">
                      <div className="flex items-center justify-between mb-6">
                        <h2 className="text-2xl font-bold text-gray-900">Your Subscription</h2>
                        <div className={`px-4 py-2 rounded-full text-sm font-semibold ${user.subscription.status === 'active'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-yellow-100 text-yellow-800'
                          }`}>
                          {user.subscription.status === 'active' ? 'Active' : 'Paused'}
                        </div>
                      </div>

                      <div className="grid md:grid-cols-2 gap-8">
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900 mb-4">{currentPlan?.name}</h3>
                          <div className="space-y-3">
                            <div className="flex justify-between">
                              <span className="text-gray-600">Monthly Price:</span>
                              <span className="font-semibold">LKR {currentPlan?.price.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600">Vegetables:</span>
                              <span className="font-semibold">{currentPlan?.vegetables} varieties</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600">Weight:</span>
                              <span className="font-semibold">{currentPlan?.weight}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600">Next Delivery:</span>
                              <span className="font-semibold text-green-600">
                                {new Date(user.subscription.nextDelivery).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <button
                            onClick={toggleSubscriptionStatus}
                            className={`w-full flex items-center justify-center space-x-2 py-3 px-6 rounded-xl font-semibold transition-colors ${user.subscription.status === 'active'
                              ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200'
                              : 'bg-green-100 text-green-800 hover:bg-green-200'
                              }`}
                          >
                            {user.subscription.status === 'active' ? (
                              <>
                                <Pause className="h-5 w-5" />
                                <span>Pause Subscription</span>
                              </>
                            ) : (
                              <>
                                <Play className="h-5 w-5" />
                                <span>Resume Subscription</span>
                              </>
                            )}
                          </button>

                          <Link
                            to="/customize"
                            className="w-full flex items-center justify-center space-x-2 py-3 px-6 rounded-xl font-semibold bg-green-600 text-white hover:bg-green-700 transition-colors"
                          >
                            <Settings className="h-5 w-5" />
                            <span>Customize Bucket</span>
                          </Link>
                        </div>
                      </div>
                    </div>

                    {/* Next Delivery */}
                    <div className="bg-gradient-to-r from-green-50 to-orange-50 rounded-3xl p-8">
                      <h3 className="text-xl font-bold text-gray-900 mb-6">Next Delivery</h3>
                      <div className="grid md:grid-cols-3 gap-6">
                        <div className="text-center">
                          <Calendar className="h-8 w-8 text-green-600 mx-auto mb-2" />
                          <div className="font-semibold text-gray-900">
                            {new Date(user.subscription.nextDelivery).toLocaleDateString('en-US', {
                              weekday: 'long',
                              month: 'long',
                              day: 'numeric'
                            })}
                          </div>
                          <div className="text-sm text-gray-600">Delivery Date</div>
                        </div>
                        <div className="text-center">
                          <Clock className="h-8 w-8 text-orange-600 mx-auto mb-2" />
                          <div className="font-semibold text-gray-900">8 AM - 12 PM</div>
                          <div className="text-sm text-gray-600">Time Window</div>
                        </div>
                        <div className="text-center">
                          <Truck className="h-8 w-8 text-blue-600 mx-auto mb-2" />
                          <div className="font-semibold text-gray-900">Free Delivery</div>
                          <div className="text-sm text-gray-600">To Your Door</div>
                        </div>
                      </div>
                    </div>

                    {/* Current Week's Vegetables Preview */}
                    <div className="bg-white rounded-3xl shadow-lg p-8">
                      <div className="flex items-center justify-between mb-6">
                        <h3 className="text-xl font-bold text-gray-900">This Week's Vegetables</h3>
                        <Link
                          to="/customize"
                          className="text-green-600 hover:text-green-700 font-medium text-sm flex items-center space-x-1"
                        >
                          <span>Customize</span>
                          <Settings className="h-4 w-4" />
                        </Link>
                      </div>

                      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {vegetables.slice(0, currentPlan?.vegetables || 7).map((veg) => (
                          <div key={veg.id} className="flex items-center justify-between p-4 bg-green-50 rounded-xl">
                            <div>
                              <div className="font-medium text-gray-900">{veg.name}</div>
                              <div className="text-sm text-gray-600">{veg.weight}</div>
                            </div>
                            <Leaf className="h-5 w-5 text-green-600" />
                          </div>
                        ))}
                      </div>

                      <div className="mt-6 p-4 bg-blue-50 border-2 border-blue-200 rounded-xl">
                        <p className="text-sm text-blue-800">
                          <strong>Fixed Pricing:</strong> Your monthly price stays at LKR {currentPlan?.price.toLocaleString()}.
                          We adjust weekly quantities based on market conditions to maintain quality and value.
                        </p>
                      </div>
                    </div>

                    {/* Billing Summary */}
                    <div className="bg-white rounded-3xl shadow-lg p-8">
                      <h3 className="text-xl font-bold text-gray-900 mb-6">Billing Summary</h3>

                      <div className="grid md:grid-cols-2 gap-8">
                        <div>
                          <div className="bg-green-50 border-2 border-green-200 rounded-2xl p-6">
                            <h4 className="font-semibold text-green-900 mb-4">Current Plan</h4>
                            <div className="flex justify-between items-center">
                              <div>
                                <div className="font-medium text-gray-900">{currentPlan?.name}</div>
                                <div className="text-sm text-gray-600">Monthly subscription</div>
                              </div>
                              <div className="text-2xl font-bold text-green-600">
                                LKR {currentPlan?.price.toLocaleString()}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div>
                          <h4 className="font-semibold text-gray-900 mb-4">Payment Method</h4>
                          <div className="bg-gray-50 rounded-xl p-4 mb-4">
                            <div className="flex items-center space-x-3">
                              <Package className="h-5 w-5 text-gray-600" />
                              <div>
                                <div className="font-medium text-gray-900">Cash on Delivery</div>
                                <div className="text-sm text-gray-600">Pay when you receive your vegetables</div>
                              </div>
                            </div>
                          </div>

                          <div className="text-center">
                            <div className="text-sm text-gray-600 mb-2">Delivery Address:</div>
                            <div className="font-medium text-gray-900">
                              {user.address || 'Please update your profile with delivery address'}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Profile Tab */}
            {activeTab === 'profile' && (
              <div className="bg-white rounded-3xl shadow-lg p-8">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-bold text-gray-900">Profile Information</h2>
                  <button
                    onClick={() => setIsEditingProfile(!isEditingProfile)}
                    className="flex items-center space-x-2 text-green-600 hover:text-green-700 transition-colors"
                  >
                    <Edit3 className="h-4 w-4" />
                    <span>{isEditingProfile ? 'Cancel' : 'Edit'}</span>
                  </button>
                </div>

                {isEditingProfile ? (
                  <div className="space-y-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Full Name</label>
                      <input
                        type="text"
                        value={profileData.name}
                        onChange={(e) => setProfileData(prev => ({ ...prev, name: e.target.value }))}
                        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Phone Number</label>
                      <input
                        type="tel"
                        value={profileData.phone}
                        onChange={(e) => setProfileData(prev => ({ ...prev, phone: e.target.value }))}
                        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent"
                        placeholder="+94 77 123 4567"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Delivery Address</label>
                      <textarea
                        value={profileData.address}
                        onChange={(e) => setProfileData(prev => ({ ...prev, address: e.target.value }))}
                        rows={3}
                        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent"
                        placeholder="Enter your full delivery address including street, city, and postal code"
                      />
                    </div>

                    <div className="flex space-x-4">
                      <button
                        onClick={handleProfileUpdate}
                        className="bg-green-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-green-700 transition-colors"
                      >
                        Save Changes
                      </button>
                      <button
                        onClick={() => {
                          setIsEditingProfile(false);
                          setProfileData({
                            name: user?.name || '',
                            phone: user?.phone || '',
                            address: user?.address || ''
                          });
                        }}
                        className="border border-gray-300 text-gray-700 px-6 py-3 rounded-xl font-semibold hover:bg-gray-50 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="grid md:grid-cols-2 gap-6">
                      <div className="space-y-4">
                        <div className="flex items-center space-x-3">
                          <User className="h-5 w-5 text-gray-600" />
                          <div>
                            <div className="text-sm text-gray-600">Full Name</div>
                            <div className="font-medium text-gray-900">{user.name}</div>
                          </div>
                        </div>

                        <div className="flex items-center space-x-3">
                          <Mail className="h-5 w-5 text-gray-600" />
                          <div>
                            <div className="text-sm text-gray-600">Email Address</div>
                            <div className="font-medium text-gray-900">{user.email}</div>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="flex items-center space-x-3">
                          <Phone className="h-5 w-5 text-gray-600" />
                          <div>
                            <div className="text-sm text-gray-600">Phone Number</div>
                            <div className="font-medium text-gray-900">{user.phone || 'Not provided'}</div>
                          </div>
                        </div>

                        <div className="flex items-start space-x-3">
                          <MapPin className="h-5 w-5 text-gray-600 mt-0.5" />
                          <div>
                            <div className="text-sm text-gray-600">Delivery Address</div>
                            <div className="font-medium text-gray-900">{user.address || 'Not provided'}</div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {(!user.phone || !user.address) && (
                      <div className="bg-orange-50 border-2 border-orange-200 rounded-xl p-4">
                        <p className="text-sm text-orange-800">
                          <strong>Complete your profile:</strong> Please add your phone number and delivery address to ensure smooth delivery of your vegetables.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <ConfirmationModal
        isOpen={isConfirmModalOpen}
        onClose={() => {
          setIsConfirmModalOpen(false);
          setPendingAction(null);
        }}
        onConfirm={handleConfirmStatusChange}
        title={pendingAction === 'pause' ? 'Pause Subscription?' : 'Resume Subscription?'}
        message={
          pendingAction === 'pause'
            ? 'Are you sure you want to pause your subscription? You will not receive any vegetable boxes until you resume.'
            : 'Are you sure you want to resume your subscription? Your vegetable deliveries will restart from the next scheduled date.'
        }
        confirmText={pendingAction === 'pause' ? 'Yes, Pause It' : 'Yes, Resume It'}
        cancelText="No, Keep It"
        isDangerous={pendingAction === 'pause'}
      />
    </div>
  );
};

export default SubscriptionPage;