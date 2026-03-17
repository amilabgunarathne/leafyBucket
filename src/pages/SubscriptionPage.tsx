import React, { useState } from 'react';
import { ArrowLeft, Package, Settings, Pause, Play, Check, Calendar, Clock, Truck, Leaf, X } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import ConfirmationModal from '../components/ConfirmationModal';
import SubscriptionService from '../services/SubscriptionService';
import VegetableService from '../services/vegetableService';

const SubscriptionPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
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
      navigate('/auth', { state: { from: { pathname: '/my-bucket' } } });
    }
  }, [user, navigate]);

  if (!user) {
    return null;
  }

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
                <h1 className="text-2xl font-bold text-gray-900">My Bucket</h1>
              </div>
              {user.subscription && user.subscription.status !== 'cancelled' && (
                <Link
                  to="/customize"
                  className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-green-600 text-white font-medium hover:bg-green-700 transition-colors"
                >
                  <Settings className="h-5 w-5" />
                  <span>Customize Bucket</span>
                </Link>
              )}
            </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
                    {/* E‑commerce style: main content (left) + subscription summary sidebar (right) */}
                    <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8">
                      {/* Your vegetables for this week - main content (left) */}
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

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

                      {/* Your Subscription - right sidebar (cart-style) */}
                      <div className="lg:sticky lg:top-28 self-start bg-white rounded-3xl shadow-lg border border-gray-200 p-6">
                        <div className="flex items-center justify-between mb-4">
                          <h2 className="text-lg font-bold text-gray-900">Your Subscription</h2>
                          <div className={`px-4 py-2 rounded-full text-sm font-semibold ${user.subscription.status === 'active'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-yellow-100 text-yellow-800'
                            }`}>
                            {user.subscription.status === 'active' ? 'Active' : 'Paused'}
                          </div>
                        </div>

                        <div className="space-y-3">
                          <div className="text-sm font-semibold text-gray-900">{currentPlan?.name}</div>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-gray-600">Monthly:</span>
                              <span className="font-semibold">LKR {currentPlan?.price.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600">Vegetables:</span>
                              <span className="font-medium">{currentPlan?.vegetables} varieties</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600">Weight:</span>
                              <span className="font-medium">{currentPlan?.weight}</span>
                            </div>
                            <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                              <span className="text-gray-600">Next delivery:</span>
                              <span className="font-semibold text-green-600">
                                {new Date(user.subscription.nextDelivery).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                          <button
                            onClick={() => setIsChangingPlan(!isChangingPlan)}
                            className="w-full text-xs font-medium py-2 rounded-lg border border-gray-300 bg-gray-50 text-gray-700 hover:bg-gray-100"
                          >
                            {isChangingPlan ? 'Cancel' : 'Change Plan'}
                          </button>
                          <button
                            onClick={toggleSubscriptionStatus}
                            className={`w-full flex items-center justify-center space-x-2 py-2.5 px-4 rounded-xl text-sm font-semibold transition-colors ${user.subscription.status === 'active'
                              ? 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200'
                              : 'bg-green-100 text-green-800 hover:bg-green-200'
                              }`}
                          >
                            {user.subscription.status === 'active' ? (
                              <>
                                <Pause className="h-4 w-4" />
                                <span>Pause bucket</span>
                              </>
                            ) : (
                              <>
                                <Play className="h-4 w-4" />
                                <span>Resume bucket</span>
                              </>
                            )}
                          </button>
                          <button
                            type="button"
                            className="w-full flex items-center justify-center space-x-2 py-2.5 px-4 rounded-xl text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 border border-gray-300 transition-colors"
                          >
                            <span>Cancel bucket</span>
                          </button>
                          <p className="text-[11px] text-gray-500 leading-tight">
                            {user.subscription.status === 'active'
                              ? 'Pausing holds deliveries only. Plan and preferences are saved—resume anytime.'
                              : 'Resume when ready; your next delivery will be scheduled.'}
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
              'Confirm plan'
        }
        message={
          pendingAction === 'pause'
            ? 'Deliveries will be put on hold. Your plan and preferences stay the same—resume anytime when you\'re ready and your next box will be scheduled.'
            : pendingAction === 'resume'
              ? 'Your vegetable deliveries will start again from the next scheduled date. Your plan is unchanged.'
              : `You're choosing the ${plans.find(p => p.id === pendingNewPlan)?.name ?? 'selected'} plan. Your billing and vegetable allocation will be based on this plan.`
        }
        confirmText={
          pendingAction === 'pause' ? 'Yes, pause for now' :
            pendingAction === 'resume' ? 'Yes, resume' :
              'Confirm'
        }
        cancelText="Cancel"
        isDangerous={false}
      />
    </div>
    </>
  );
};

export default SubscriptionPage;