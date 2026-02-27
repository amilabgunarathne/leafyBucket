import React, { useState } from 'react';
import { ArrowLeft, Package, Settings, User, Edit3, MapPin, Phone, Mail, Pause, Play, Check, Calendar, Clock, Truck, Leaf, X, Loader2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import ConfirmationModal from '../components/ConfirmationModal';
import SubscriptionService from '../services/SubscriptionService';
import VegetableService from '../services/vegetableService';

const SubscriptionPage = () => {
  const { user, updateUser, updateEmail, logout } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('overview');
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileData, setProfileData] = useState({
    name: user?.name || '',
    email: user?.email || '',
    phone: user?.phone || '',
    address: user?.address || ''
  });
  const [profileEmailError, setProfileEmailError] = useState<string | null>(null);
  const [profileEmailSuccess, setProfileEmailSuccess] = useState<string | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<'pause' | 'resume' | 'change_plan' | null>(null);
  const [isChangingPlan, setIsChangingPlan] = useState(false);
  const [pendingNewPlan, setPendingNewPlan] = useState<string | null>(null);

  const [activeSubscription, setActiveSubscription] = useState<any>(null);
  const [currentDelivery, setCurrentDelivery] = useState<any>(null);
  const bucketTypesRef = React.useRef<any[]>([]);

  // Fetch real subscription details
  React.useEffect(() => {
    if (user) {
      const fetchSub = async () => {
        const { default: SubscriptionService } = await import('../services/SubscriptionService');
        const data = await SubscriptionService.getInstance().getActiveSubscription(user.id);
        if (data) {
          setActiveSubscription(data.subscription);
          setCurrentDelivery(data.currentDelivery);
        }
      };
      fetchSub();
    }
  }, [user]);

  // Using activeSubscription to suppress lint (will be used for detailed view later)
  React.useEffect(() => {
    if (activeSubscription) {
      console.log("Loaded active subscription:", activeSubscription.id);
    }
  }, [activeSubscription]);

  // Redirect if not logged in
  React.useEffect(() => {
    if (!user) {
      navigate('/auth', { state: { from: { pathname: '/my-account' } } });
    }
  }, [user, navigate]);

  // Sync profile form when user or edit mode changes
  React.useEffect(() => {
    if (user) {
      setProfileData({
        name: user.name || '',
        email: user.email || '',
        phone: user.phone || '',
        address: user.address || ''
      });
    }
  }, [user?.id, user?.name, user?.email, user?.phone, user?.address, isEditingProfile]);

  if (!user) {
    return null;
  }

  const handleProfileUpdate = async () => {
    setProfileEmailError(null);
    setProfileEmailSuccess(null);
    setIsSavingProfile(true);
    const emailChanged = profileData.email.trim().toLowerCase() !== (user.email || '').trim().toLowerCase();

    try {
      if (emailChanged) {
        const { success, error } = await updateEmail(profileData.email.trim());
        if (!success) {
          setProfileEmailError(error || 'Failed to send confirmation to new email.');
          return;
        }
        // Log out so they cannot keep using the old email until they confirm the new one
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.setItem('leafy_email_change_requested', '1');
        }
        updateUser({
          name: profileData.name,
          phone: profileData.phone,
          address: profileData.address
        });
        logout();
        return;
      }

      updateUser({
        name: profileData.name,
        phone: profileData.phone,
        address: profileData.address
      });
      setIsEditingProfile(false);
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleStartSubscriptionRequest = (planId: string) => {
    setPendingNewPlan(planId);
    setPendingAction('change_plan'); // Re-use for initial selection too
    setIsConfirmModalOpen(true);
  };

  const handleConfirmStatusChange = async () => {
    if (!user || (!user.subscription && pendingAction !== 'change_plan')) return;

    try {
      const subService = SubscriptionService.getInstance();

      if (pendingAction === 'change_plan' && pendingNewPlan) {
        // Find the bucket type for this plan
        const bucketType = bucketTypesRef.current.find(bt => {
          const mappedId = bt.name.toLowerCase() === 'mini' ? 'small' : bt.name.toLowerCase() === 'family' ? 'medium' : 'large';
          return mappedId === pendingNewPlan;
        });

        if (!bucketType) throw new Error("Bucket type not found");

        if (!user.subscription) {
          // INITIAL SUBSCRIPTION
          await subService.createSubscription(user.id, bucketType.id);

          // Force refresh everything to ensure AuthContext picks up the new record
          window.location.reload();
        } else {
          // PLAN CHANGE
          await subService.updateSubscriptionPlan(user.subscription.id, bucketType.id);

          // Force refresh
          window.location.reload();
        }
        setPendingNewPlan(null);
      } else if (user.subscription && (pendingAction === 'pause' || pendingAction === 'resume')) {
        // STATUS UPDATE
        const newStatus = pendingAction === 'pause' ? 'paused' : 'active';
        await subService.updateSubscriptionStatus(user.subscription.id, newStatus);

        // Force refresh
        window.location.reload();
      }
    } catch (error) {
      console.error("Error updating subscription:", error);
      alert("Failed to update subscription. Please try again.");
    } finally {
      setIsConfirmModalOpen(false);
      setPendingAction(null);
    }
  };

  const toggleSubscriptionStatus = () => {
    if (user.subscription) {
      const isPaused = user.subscription.status === 'paused';
      setPendingAction(isPaused ? 'resume' : 'pause');
      setIsConfirmModalOpen(true);
    }
  };

  const handlePlanChangeInitiate = (planId: string) => {
    if (planId === user.subscription?.plan) {
      setIsChangingPlan(false);
      return;
    }
    setIsChangingPlan(false);
    setPendingNewPlan(planId);
    setPendingAction('change_plan');
    setIsConfirmModalOpen(true);
  };

  /* 
   * Dynamic Plans Fetching 
   */
  const [plans, setPlans] = useState<any[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(true);

  React.useEffect(() => {
    const fetchPlans = async () => {
      try {
        console.log("Fetching plans...");
        const bucketTypes = await SubscriptionService.getInstance().getBucketTypes();
        console.log("Fetched bucket types:", bucketTypes);

        if (bucketTypes.length === 0) {
          console.warn("No bucket types found in DB. Using fallback.");
          setPlans([
            { id: 'small', name: 'Mini Family', price: 11600, description: 'Perfect for 1-2 people', vegetables: 4, weight: "1.5 - 2 kg" },
            { id: 'medium', name: 'Family', price: 19600, description: 'Great for 3-4 people', vegetables: 7, weight: "3 - 3.5 kg" },
            { id: 'large', name: 'Plus Family', price: 27600, description: 'Ideal for 5+ people', vegetables: 10, weight: "4.5 - 5 kg" }
          ]);
          return;
        }

        const validBucketTypes = bucketTypes.filter(bt => ['mini', 'family', 'plus'].includes(bt.name.toLowerCase()));
        bucketTypesRef.current = bucketTypes;

        const mappedPlans = await Promise.all(validBucketTypes.map(async (bt) => {
          const id = bt.name.toLowerCase() === 'mini' ? 'small' : bt.name.toLowerCase() === 'family' ? 'medium' : 'large';

          let weight = "1.5 - 2 kg";
          if (id === 'medium') weight = "3 - 3.5 kg";
          if (id === 'large') weight = "4.5 - 5 kg";

          return {
            id,
            name: bt.name + (bt.name === 'Mini' ? ' Family' : bt.name === 'Family' ? '' : ' Family'),
            price: bt.monthly_price,
            description: bt.description,
            vegetables: parseInt(bt.display_item_range.replace(/\D/g, '')) || 7,
            weight
          };
        }));

        mappedPlans.sort((a, b) => a.price - b.price);
        setPlans(mappedPlans);
      } catch (error) {
        console.error("Error loading plans:", error);
        setPlans([
          { id: 'small', name: 'Mini Family', price: 11600, description: 'Perfect for 1-2 people', vegetables: 4, weight: "1.5 - 2 kg" },
          { id: 'medium', name: 'Family', price: 19600, description: 'Great for 3-4 people', vegetables: 7, weight: "3 - 3.5 kg" },
          { id: 'large', name: 'Plus Family', price: 27600, description: 'Ideal for 5+ people', vegetables: 10, weight: "4.5 - 5 kg" }
        ]);
      } finally {
        setLoadingPlans(false);
      }
    };

    fetchPlans();
  }, []);

  const currentPlan = plans.find(p => p.id === user.subscription?.plan);

  const [vegetables, setVegetables] = useState<{ id: string, name: string, weight: string }[]>([]);
  const vegetableService = VegetableService.getInstance();

  React.useEffect(() => {
    const fetchVegetables = async () => {
      await vegetableService.initialize();
      const activeVegetables = vegetableService.getActiveVegetablesForBulk();
      const formattedVegetables = activeVegetables.map(v => ({
        id: v.id,
        name: v.name,
        weight: v.typicalWeight
      }));
      setVegetables(formattedVegetables);
    };
    fetchVegetables();
  }, []);

  return (
    <>
      {/* Full-screen spinner while saving profile */}
      {isSavingProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl p-8 flex flex-col items-center gap-4 shadow-xl">
            <Loader2 className="h-12 w-12 animate-spin text-green-600" />
            <p className="text-gray-700 font-medium">Saving...</p>
          </div>
        </div>
      )}

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
                {(!user.subscription || user.subscription.status === 'cancelled') ? (
                  /* No Subscription - Plan Selection */
                  <div className="bg-white rounded-3xl shadow-lg p-8">
                    <div className="text-center mb-8">
                      <h2 className="text-3xl font-bold text-gray-900 mb-4">Choose Your Leafy Bucket Plan</h2>
                      <p className="text-gray-600">Start your journey to healthier eating with fresh vegetables delivered weekly</p>
                    </div>

                    {loadingPlans ? (
                      <div className="text-center py-12">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
                        <p className="text-gray-500">Loading plans...</p>
                      </div>
                    ) : (
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
                              onClick={() => handleStartSubscriptionRequest(plan.id)}
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
                    )}
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
                            <div className="flex justify-between items-center py-2 border-t border-gray-100 mt-2">
                              <span className="text-gray-600">Plan Size:</span>
                              <div className="flex items-center space-x-2">
                                <span className="font-bold text-green-700">{currentPlan?.name}</span>
                                <button
                                  onClick={() => setIsChangingPlan(!isChangingPlan)}
                                  className="text-xs font-medium px-2.5 py-1 rounded-md border border-gray-300 bg-gray-50 text-gray-700 hover:bg-gray-100 hover:border-gray-400 transition-colors"
                                >
                                  {isChangingPlan ? 'Cancel' : 'Change Plan'}
                                </button>
                              </div>
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
                              ? 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200'
                              : 'bg-green-100 text-green-800 hover:bg-green-200'
                              }`}
                          >
                            {user.subscription.status === 'active' ? (
                              <>
                                <Pause className="h-5 w-5" />
                                <span>Pause bucket</span>
                              </>
                            ) : (
                              <>
                                <Play className="h-5 w-5" />
                                <span>Resume bucket</span>
                              </>
                            )}
                          </button>
                          <p className="text-xs text-gray-500 text-center">
                            {user.subscription.status === 'active'
                              ? 'Pausing holds deliveries only. Your plan and preferences are saved—resume anytime.'
                              : 'Resume when you\'re ready; your next delivery will be scheduled.'}
                          </p>
                        </div>
                      </div>

                    </div>

                    {/* Change Plan Modal */}
                    {isChangingPlan && (
                      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setIsChangingPlan(false)}>
                        <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-between p-4 border-b border-gray-200">
                            <h3 className="text-lg font-bold text-gray-900">Select Plan Size</h3>
                            <button
                              type="button"
                              onClick={() => setIsChangingPlan(false)}
                              className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                              aria-label="Close"
                            >
                              <X className="h-5 w-5" />
                            </button>
                          </div>
                          <div className="p-4">
                            <div className="grid grid-cols-1 gap-3">
                              {plans.map((plan) => (
                                <button
                                  key={plan.id}
                                  onClick={() => handlePlanChangeInitiate(plan.id)}
                                  className={`p-4 rounded-xl border-2 text-left transition-all ${plan.id === user.subscription?.plan
                                    ? 'border-green-600 bg-green-50'
                                    : 'border-gray-100 hover:border-green-200 hover:bg-green-50/50'
                                    }`}
                                >
                                  <div className="font-bold text-gray-900">{plan.name}</div>
                                  <div className="text-sm text-green-600 font-semibold mb-1">LKR {plan.price.toLocaleString()}</div>
                                  <div className="text-xs text-gray-600">{plan.vegetables} varieties • {plan.weight}</div>
                                  {plan.id === user.subscription?.plan && (
                                    <div className="mt-2 text-[10px] uppercase tracking-wider font-bold text-green-700">Current Plan</div>
                                  )}
                                </button>
                              ))}
                            </div>
                            <button
                              type="button"
                              onClick={() => setIsChangingPlan(false)}
                              className="mt-4 w-full py-2 rounded-xl border border-gray-300 text-gray-700 font-medium hover:bg-gray-50"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Next Delivery from Real DB or Context Fallback */}
                    <div className="bg-gradient-to-r from-green-50 to-orange-50 rounded-3xl p-8">
                      <h3 className="text-xl font-bold text-gray-900 mb-6">Next Delivery</h3>
                      <div className="grid md:grid-cols-3 gap-6">
                        <div className="text-center">
                          <Calendar className="h-8 w-8 text-green-600 mx-auto mb-2" />
                          <div className="font-semibold text-gray-900">
                            {new Date(currentDelivery?.scheduled_date || user.subscription.nextDelivery).toLocaleDateString('en-US', {
                              weekday: 'long',
                              month: 'long',
                              day: 'numeric'
                            })}
                          </div>
                          <div className="text-sm text-gray-600">
                            {currentDelivery ? `Delivery #${currentDelivery.delivery_index} of 4` : 'Delivery Date'}
                          </div>
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
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-xl font-bold text-gray-900">Your vegetables for this week</h3>
                        <Link
                          to="/customize"
                          className="text-green-600 hover:text-green-700 font-medium text-sm flex items-center space-x-1"
                        >
                          <span>Customize</span>
                          <Settings className="h-4 w-4" />
                        </Link>
                      </div>
                      <p className="text-sm text-gray-600 mb-6">Here’s what’s in your bucket for the current week. Use Customize to swap or add items before we lock your selection.</p>

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
                      <label className="block text-sm font-medium text-gray-700 mb-2">Email Address</label>
                      <input
                        type="email"
                        value={profileData.email}
                        onChange={(e) => {
                          setProfileData(prev => ({ ...prev, email: e.target.value }));
                          setProfileEmailError(null);
                          setProfileEmailSuccess(null);
                        }}
                        className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent ${profileEmailError ? 'border-red-500' : 'border-gray-300'}`}
                        placeholder="you@example.com"
                      />
                      {profileEmailError && (
                        <p className="mt-1 text-sm text-red-600">{profileEmailError}</p>
                      )}
                      {profileEmailSuccess && (
                        <p className="mt-1 text-sm text-green-600">{profileEmailSuccess}</p>
                      )}
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
                        type="button"
                        onClick={handleProfileUpdate}
                        disabled={isSavingProfile}
                        className="bg-green-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-green-700 transition-colors disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2"
                      >
                        {isSavingProfile && <Loader2 className="h-4 w-4 animate-spin" />}
                        {isSavingProfile ? 'Saving...' : 'Save Changes'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsEditingProfile(false);
                          setProfileEmailError(null);
                          setProfileEmailSuccess(null);
                          setProfileData({
                            name: user?.name || '',
                            email: user?.email || '',
                            phone: user?.phone || '',
                            address: user?.address || ''
                          });
                        }}
                        disabled={isSavingProfile}
                        className="border border-gray-300 text-gray-700 px-6 py-3 rounded-xl font-semibold hover:bg-gray-50 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
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
        title={
          pendingAction === 'pause' ? 'Pause deliveries for a while?' :
            pendingAction === 'resume' ? 'Resume deliveries?' :
              'Change Plan Size?'
        }
        message={
          pendingAction === 'pause'
            ? 'Deliveries will be put on hold. Your plan and preferences stay the same—resume anytime when you\'re ready and your next box will be scheduled.'
            : pendingAction === 'resume'
              ? 'Your vegetable deliveries will start again from the next scheduled date. Your plan is unchanged.'
              : `Are you sure you want to change your plan to ${plans.find(p => p.id === pendingNewPlan)?.name}? Your next bill and vegetable allocation will update immediately.`
        }
        confirmText={
          pendingAction === 'pause' ? 'Yes, pause for now' :
            pendingAction === 'resume' ? 'Yes, resume' :
              'Confirm New Plan'
        }
        cancelText="No, keep as is"
        isDangerous={false}
      />
    </div>
    </>
  );
};

export default SubscriptionPage;