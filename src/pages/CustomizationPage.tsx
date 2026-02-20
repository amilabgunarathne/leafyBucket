import { useState, useEffect } from 'react';
import { ArrowLeft, Check, X, Plus, Settings, Package, RefreshCw, Lock, TreePine, Leaf, Flower, Clock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Vegetable, calculatePlanAllocation, getWeightBreakdownByCategory } from '../data/vegetables';
import VegetableService from '../services/vegetableService';
import { useWeekly } from '../contexts/WeeklyContext';
import { useAuth } from '../contexts/AuthContext';
import WeeklyScheduleInfo from '../components/WeeklyScheduleInfo';

const CustomizationPage = () => {
  const { user, updateUser } = useAuth();
  const [selectedPlan, setSelectedPlan] = useState<string>(user?.subscription?.plan || 'medium');
  const [customizations, setCustomizations] = useState<{
    excludedVegetables: string[];
    removedVegetables: string[];
    addedVegetables: string[];
    deliveryDay: string;
  }>({
    excludedVegetables: user?.subscription?.customizations?.excludedVegetables || [],
    removedVegetables: user?.subscription?.customizations?.removedVegetables || [],
    addedVegetables: user?.subscription?.customizations?.addedVegetables || [],
    deliveryDay: user?.subscription?.customizations?.deliveryDay || 'sunday'
  });

  // Sync state if user subscription changes (e.g., plan updated in account page)
  useEffect(() => {
    if (user?.subscription) {
      setSelectedPlan(user.subscription.plan);
      setCustomizations({
        excludedVegetables: user.subscription.customizations.excludedVegetables || [],
        removedVegetables: user.subscription.customizations.removedVegetables || [],
        addedVegetables: user.subscription.customizations.addedVegetables || [],
        deliveryDay: user.subscription.customizations.deliveryDay || 'sunday'
      });
    }
  }, [user?.subscription?.plan, user?.subscription?.customizations]);

  const [vegetables, setVegetables] = useState<Vegetable[]>([]);
  const vegetableService = VegetableService.getInstance();

  useEffect(() => {
    const fetchVegetables = async () => {
      await vegetableService.initialize();
      setVegetables(vegetableService.getActiveVegetablesForBulk());
    };
    fetchVegetables();
  }, [vegetableService]);

  const { getSelectionForPlan, isCustomizationAllowed, timeRemaining, scheduleDisplay } = useWeekly();


  // Fetch dynamic limits from DB; ratios from bucket_type_category_ratios (same as Admin)
  const [adminLimits, setAdminLimits] = useState<any>(null);
  const [bucketTypeRatiosFromDb, setBucketTypeRatiosFromDb] = useState<Record<string, { root: number; leafy: number; bushy: number }>>({});
  const [loadingLimits, setLoadingLimits] = useState(true);

  useEffect(() => {
    const fetchLimits = async () => {
      try {
        const { default: SubscriptionService } = await import('../services/SubscriptionService');
        const { getOrCreateCurrentWeek, getVegCountFromBucketType, parseVegRange } = await import('../utils/marketWeekUtils');
        const { supabase } = await import('../lib/supabase');

        // Ensure vegetables (and any initial ratios) are loaded first, then we overwrite with fresh DB ratios
        await vegetableService.initialize();

        const bucketTypes = await SubscriptionService.getInstance().getBucketTypes();
        const { data: weeksData } = await supabase.from('market_weeks').select('id, week_start_date, week_end_date, is_locked').order('week_start_date', { ascending: false });
        const currentWeek = getOrCreateCurrentWeek(weeksData || []);

        const limits: any = {};
        const byBucketTypeId: Record<string, { root: number; leafy: number; bushy: number }> = {};
        bucketTypes.forEach(bt => {
          const n = bt.name.toLowerCase();
          const id = n === 'mini' || n === 'small' ? 'small' : n === 'family' || n === 'medium' ? 'medium' : 'large';
          const [rangeMin, rangeMax] = parseVegRange(bt.display_item_range, id);
          const count = getVegCountFromBucketType(bt.display_item_range, bt.root_count, bt.leafy_count, bt.bushy_count);

          limits[id] = {
            current: count,
            range: [rangeMin, rangeMax],
            fixedPrice: bt.monthly_price,
            monthlyHandlingFee: bt.handling_fee,
            vegetableBudget: (bt.monthly_price - bt.handling_fee) / 4,
            bucketTypeId: bt.id,
            counts: {
              root: bt.root_count || 0,
              bushy: bt.bushy_count || 0,
              leafy: bt.leafy_count || 0
            }
          };
          // Budget share % from bucket_types (same table Admin writes to — single source of truth)
          const rPct = bt.root_budget_pct != null ? Math.max(0, Math.min(100, bt.root_budget_pct)) : 34;
          const lPct = bt.leafy_budget_pct != null ? Math.max(0, Math.min(100, bt.leafy_budget_pct)) : 33;
          const bPct = bt.bushy_budget_pct != null ? Math.max(0, Math.min(100, bt.bushy_budget_pct)) : 33;
          const sum = rPct + lPct + bPct;
          byBucketTypeId[bt.id] = sum >= 20 ? { root: rPct, leafy: lPct, bushy: bPct } : { root: 34, leafy: 33, bushy: 33 };
        });
        VegetableService.getInstance().setBucketTypeRatios(byBucketTypeId);
        setBucketTypeRatiosFromDb(byBucketTypeId);
        setAdminLimits(limits);
      } catch (error) {
        console.error("Error loading limits:", error);
      } finally {
        setLoadingLimits(false);
      }
    };
    fetchLimits();
  }, [vegetableService]);

  // Base plan configurations
  const basePlans = {
    small: {
      name: 'Small Family',
      defaultVegetableCount: 4,
      description: 'Perfect for 1-2 people',
    },
    medium: {
      name: 'Medium Family',
      defaultVegetableCount: 7,
      description: 'Great for 3-4 people',
    },
    large: {
      name: 'Large Family',
      defaultVegetableCount: 10,
      description: 'Ideal for 5+ people',
    }
  };

  const CATEGORICAL_FALLBACKS: Record<string, { root: number, bushy: number, leafy: number }> = {
    small: { root: 1, bushy: 2, leafy: 1 },
    medium: { root: 2, bushy: 3, leafy: 2 },
    large: { root: 3, bushy: 4, leafy: 3 }
  };

  // Get current week's admin-set limits
  const getCurrentWeekLimits = () => {
    if (!adminLimits) return null;
    return adminLimits[selectedPlan as keyof typeof adminLimits];
  };

  // Calculate current vegetable count in bucket
  const getCurrentVegetableCount = () => {
    return getCurrentVegetables().length;
  };

  const getCurrentPlan = () => {
    const basePlan = basePlans[selectedPlan as keyof typeof basePlans] || basePlans.medium;
    const weekLimits = getCurrentWeekLimits();

    if (!weekLimits) {
      // Fallback while loading
      return {
        ...basePlan,
        currentVegetableCount: 0,
        maxLimit: basePlan.defaultVegetableCount,
        adminRange: [basePlan.defaultVegetableCount, basePlan.defaultVegetableCount],
        fixedPrice: 0,
        monthlyHandlingFee: 0,
        vegetableBudget: 0,
        bucketTypeId: undefined as string | undefined,
        categoricalLimits: CATEGORICAL_FALLBACKS[selectedPlan] || { root: 0, bushy: 0, leafy: 0 }
      };
    }

    const btCounts = weekLimits.counts || {};

    const categoricalLimits = {
      root: btCounts.root || CATEGORICAL_FALLBACKS[selectedPlan]?.root || 0,
      bushy: btCounts.bushy || CATEGORICAL_FALLBACKS[selectedPlan]?.bushy || 0,
      leafy: btCounts.leafy || CATEGORICAL_FALLBACKS[selectedPlan]?.leafy || 0
    };

    return {
      ...basePlan,
      currentVegetableCount: getCurrentVegetableCount(),
      maxLimit: weekLimits.current,
      adminRange: weekLimits.range,
      fixedPrice: weekLimits.fixedPrice,
      monthlyHandlingFee: weekLimits.monthlyHandlingFee,
      vegetableBudget: weekLimits.vegetableBudget,
      bucketTypeId: weekLimits.bucketTypeId,
      categoricalLimits
    };
  };

  const getDefaultVegetables = () => {
    const selection = getSelectionForPlan(selectedPlan as any);
    return selection?.vegetables ?? [];
  };

  const getCurrentVegetables = () => {
    const defaultVegs = getDefaultVegetables();
    const finalVegetables = defaultVegs
      .filter(vegId => !customizations.removedVegetables.includes(vegId))
      .concat(customizations.addedVegetables);

    // DEFENSIVE: Filter out any IDs that don't exist in our DB-fetched list
    const validVegIds = vegetables.map(v => v.id);
    return finalVegetables.filter(id => validVegIds.includes(id));
  };

  const getAvailableVegetables = () => {
    const currentVegetables = getCurrentVegetables();
    return vegetables.filter(veg => !currentVegetables.includes(veg.id));
  };

  // Check if we can add more vegetables of a specific category (must not exceed total quota)
  const canAddMoreOfCategory = (category: 'root' | 'leafy' | 'bushy') => {
    if (!isCustomizationAllowed) return false;

    const currentPlan = getCurrentPlan();
    const currentCount = getCurrentVegetableCount();
    // Never allow exceeding total bucket quota (e.g. 5/4)
    if (currentCount >= currentPlan.maxLimit) return false;

    if (!currentPlan.categoricalLimits) return true; // Fallback if no limits loaded

    const currentVegs = getCurrentVegetables();
    const countInCategory = currentVegs.filter(id => {
      const veg = vegetables.find(v => v.id === id);
      return veg?.category === category;
    }).length;

    const limitForCategory = currentPlan.categoricalLimits[category] || 0;
    return countInCategory < limitForCategory;
  };

  const handleSavePreferences = async () => {
    if (!user) return;

    try {
      const { default: SubscriptionService } = await import('../services/SubscriptionService');
      const subService = SubscriptionService.getInstance();
      const activeSub = await subService.getActiveSubscription(user.id);

      if (activeSub && activeSub.currentDelivery) {
        // Log removed items
        for (const removedId of customizations.removedVegetables) {
          await subService.logCustomization(activeSub.currentDelivery.id, {
            action_type: 'remove',
            removed_vegetable_id: removedId
          });
        }
        // Log added items
        for (const addedId of customizations.addedVegetables) {
          await subService.logCustomization(activeSub.currentDelivery.id, {
            action_type: 'add',
            added_vegetable_id: addedId
          });
        }
      }
    } catch (e) {
      console.error("Error saving customizations:", e);
    }

    // Keep updating local state for fallback/UI speed
    updateUser({
      subscription: {
        ...user.subscription!,
        plan: selectedPlan as 'small' | 'medium' | 'large',
        customizations: {
          ...customizations
        }
      }
    });

    alert('Preferences saved successfully!');
  };

  const handleStartSubscription = async () => {
    if (!user) return;

    const nextDelivery = new Date();
    nextDelivery.setDate(nextDelivery.getDate() + 7);

    try {
      // Create actual subscription if none exists
      if (!user.subscription || user.subscription.id === 'temp-id') {
        // Placeholder: In a real app we'd call the service here
        // const { default: SubscriptionService } = await import('../services/SubscriptionService');
        // await SubscriptionService.getInstance().createSubscription(user.id, 'BUCKET_ID_HERE');
        console.log("Mocking subscription creation...");
      }
    } catch (e) {
      console.error("Error starting subscription:", e);
    }

    updateUser({
      subscription: {
        id: (user.subscription?.id && user.subscription.id !== 'temp-id') ? user.subscription.id : 'temp-id',
        plan: selectedPlan as 'small' | 'medium' | 'large',
        status: 'active',
        nextDelivery: nextDelivery.toISOString().split('T')[0],
        customizations: {
          ...customizations
        }
      }
    });

    alert('Subscription started successfully!');
  };

  const toggleVegetableRemoval = (vegetableId: string) => {
    if (!isCustomizationAllowed) return;

    setCustomizations((prev: any) => {
      const isCurrentlyRemoved = prev.removedVegetables.includes(vegetableId);

      if (isCurrentlyRemoved) {
        return {
          ...prev,
          removedVegetables: prev.removedVegetables.filter((id: string) => id !== vegetableId)
        };
      } else {
        // When removing a default vegetable, it should be added to removedVegetables
        // If it was previously added by the user, it should be removed from addedVegetables
        const isCurrentlyAddedByUser = prev.addedVegetables.includes(vegetableId);
        if (isCurrentlyAddedByUser) {
          return {
            ...prev,
            addedVegetables: prev.addedVegetables.filter((id: string) => id !== vegetableId)
          };
        } else {
          return {
            ...prev,
            removedVegetables: [...prev.removedVegetables, vegetableId]
          };
        }
      }
    });
  };

  const toggleVegetableAddition = (vegetableId: string, category: 'root' | 'leafy' | 'bushy') => {
    if (!isCustomizationAllowed) return;

    setCustomizations((prev: any) => {
      const isCurrentlyAdded = prev.addedVegetables.includes(vegetableId);

      if (isCurrentlyAdded) {
        return {
          ...prev,
          addedVegetables: prev.addedVegetables.filter((id: string) => id !== vegetableId)
        };
      } else {
        if (canAddMoreOfCategory(category)) {
          return {
            ...prev,
            addedVegetables: [...prev.addedVegetables, vegetableId]
          };
        }
        return prev;
      }
    });
  };

  const resetCustomizations = () => {
    if (!isCustomizationAllowed) return;

    setCustomizations({
      excludedVegetables: [],
      removedVegetables: [],
      addedVegetables: [],
      deliveryDay: 'sunday'
    });
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

  // Ratios from DB (bucket_type_category_ratios) so allocation matches Admin panel
  const getCategoryRatiosForPlan = () => {
    const plan = getCurrentPlan();
    const fromDb = plan.bucketTypeId ? bucketTypeRatiosFromDb[plan.bucketTypeId] : undefined;
    return fromDb ?? undefined; // pass undefined to use service fallback when no DB ratios yet
  };

  const getCurrentAllocation = () => {
    const currentVegetables = getCurrentVegetables();
    const currentPlan = getCurrentPlan();
    return calculatePlanAllocation(
      currentPlan.vegetableBudget,
      currentVegetables,
      vegetables,
      currentPlan.categoricalLimits,
      currentPlan.bucketTypeId,
      getCategoryRatiosForPlan()
    );
  };

  const getWeightBreakdown = () => {
    const currentVegetables = getCurrentVegetables();
    const currentPlan = getCurrentPlan();
    return getWeightBreakdownByCategory(
      currentPlan.vegetableBudget,
      currentVegetables,
      vegetables,
      currentPlan.categoricalLimits,
      currentPlan.bucketTypeId,
      getCategoryRatiosForPlan()
    );
  };

  const formatTimeRemaining = () => {
    if (timeRemaining.isExpired) {
      return "Customization period has ended";
    }

    if (timeRemaining.days > 0) {
      return `${timeRemaining.days} days, ${timeRemaining.hours} hours remaining`;
    } else if (timeRemaining.hours > 0) {
      return `${timeRemaining.hours} hours, ${timeRemaining.minutes} minutes remaining`;
    } else {
      return `${timeRemaining.minutes} minutes remaining`;
    }
  };

  return (
    <div className="pt-16">
      {loadingLimits ? (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
            <p className="text-gray-500">Loading your bucket configuration...</p>
          </div>
        </div>
      ) : (
        <>
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
                  <Settings className="h-10 w-10 text-green-600" />
                  <h1 className="text-5xl lg:text-6xl font-bold text-gray-900 leading-tight">
                    Customize Your
                    <span className="text-green-600"> Leafy Bucket</span>
                  </h1>
                </div>
                <p className="text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed">
                  <span className="font-semibold text-green-700">Fixed monthly pricing, smart budget & weight allocation!</span>
                  Choose your vegetables within this week's limit. Our system automatically balances variety and adjusts weights based on vegetable categories.
                </p>

                {/* Customization Status Banner */}
                {!isCustomizationAllowed ? (
                  <div className="max-w-2xl mx-auto bg-orange-50 border-2 border-orange-200 rounded-xl p-4">
                    <div className="flex items-center space-x-3">
                      <Clock className="h-6 w-6 text-orange-600" />
                      <div>
                        <div className="font-semibold text-orange-900">Customization Closed</div>
                        <div className="text-sm text-orange-700">
                          {scheduleDisplay
                            ? `Opens ${scheduleDisplay.openLabel}. Closes ${scheduleDisplay.closeLabel}.`
                            : 'Opening and closing times are set by the market.'}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="max-w-2xl mx-auto bg-green-50 border-2 border-green-200 rounded-xl p-4">
                    <div className="flex items-center space-x-3">
                      <Check className="h-6 w-6 text-green-600" />
                      <div>
                        <div className="font-semibold text-green-900">Customization Available</div>
                        <div className="text-sm text-green-700">
                          {formatTimeRemaining()}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Customization Content */}
          {/* Customization Content */}
          <section className="py-20 bg-gray-50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="grid lg:grid-cols-4 gap-8">
                {/* Weekly Schedule Sidebar */}
                <div className="lg:col-span-1">
                  <div className="space-y-6">
                    <WeeklyScheduleInfo />
                  </div>
                </div>

                {/* Main Customization Content */}
                <div className="lg:col-span-2 space-y-8">
                  {/* Current Bucket Contents */}
                  <div className="bg-white rounded-3xl p-8 shadow-lg">
                    <div className="flex items-center justify-between mb-6">
                      <div>
                        <h3 className="text-2xl font-bold text-gray-900">1. Your Weekly Leafy Bucket</h3>
                        <div className="text-sm text-gray-600 mt-1">
                          {getCurrentVegetableCount()}/{getCurrentPlan().maxLimit} vegetables this week
                        </div>
                      </div>
                    </div>

                    {!isCustomizationAllowed && (
                      <div className="mb-6 p-4 bg-orange-50 border-2 border-orange-200 rounded-xl">
                        <div className="flex items-center space-x-3">
                          <Clock className="h-5 w-5 text-orange-600" />
                          <div>
                            <div className="font-semibold text-orange-900">Customization Period Ended</div>
                            <div className="text-sm text-orange-700">
                              This week's selection is finalized.
                              {scheduleDisplay?.nextOpeningDate
                                ? ` Changes will be available next ${scheduleDisplay.nextOpeningDate.toLocaleDateString('en-US', { weekday: 'long' })}.`
                                : ' Changes will be available when the next customization window opens.'}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}


                    <div className="grid md:grid-cols-2 gap-4">
                      {getDefaultVegetables()
                        .filter(vegId => !customizations.removedVegetables.includes(vegId))
                        .filter(id => vegetables.some(v => v.id === id)) // Ensure valid data
                        .map((vegetableId) => {
                          const vegetable = vegetables.find(v => v.id === vegetableId);
                          const allocation = getCurrentAllocation().find(v => v.id === vegetableId);
                          const CategoryIcon = getCategoryIcon(vegetable?.category || 'leafy');

                          return (
                            <div
                              key={vegetableId}
                              className="p-4 rounded-xl border-2 border-green-200 bg-green-50 transition-all"
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center space-x-2 mb-1">
                                    <h4 className="font-semibold text-gray-900">{vegetable?.name}</h4>
                                    <CategoryIcon className={`h-4 w-4 ${getCategoryColor(vegetable?.category || 'leafy').split(' ')[0]}`} />
                                  </div>
                                  <p className="text-sm text-gray-600">~{allocation?.allocatedWeight || 0}g</p>
                                  <p className="text-xs text-green-600">
                                    Allocated: LKR {allocation?.allocatedBudget || 0}
                                  </p>
                                </div>
                                <button
                                  onClick={() => toggleVegetableRemoval(vegetableId)}
                                  disabled={!isCustomizationAllowed}
                                  className={`p-2 rounded-full transition-colors ${isCustomizationAllowed
                                    ? 'bg-red-100 text-red-600 hover:bg-red-200'
                                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                    }`}
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                          );
                        })}

                      {/* Show added vegetables */}
                      {customizations.addedVegetables.map((vegetableId) => {
                        const vegetable = vegetables.find(v => v.id === vegetableId);
                        const CategoryIcon = getCategoryIcon(vegetable?.category || 'leafy');
                        const allocation = getCurrentAllocation().find(v => v.id === vegetableId);

                        return (
                          <div
                            key={vegetableId}
                            className="p-4 rounded-xl border-2 border-blue-200 bg-blue-50 transition-all"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <div className="flex items-center space-x-2 mb-1">
                                  <h4 className="font-semibold text-gray-900">{vegetable?.name}</h4>
                                  <CategoryIcon className={`h-4 w-4 ${getCategoryColor(vegetable?.category || 'leafy').split(' ')[0]}`} />
                                </div>
                                <p className="text-sm text-gray-600">~{allocation?.allocatedWeight || 0}g</p>
                                <p className="text-xs text-blue-600">
                                  ADDED • Allocated: LKR {allocation?.allocatedBudget || 0}
                                </p>
                              </div>
                              <button
                                onClick={() => vegetable && toggleVegetableAddition(vegetableId, vegetable.category as any)}
                                disabled={!isCustomizationAllowed}
                                className={`p-2 rounded-full transition-colors ${isCustomizationAllowed
                                  ? 'bg-red-100 text-red-600 hover:bg-red-200'
                                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                  }`}
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Add More Vegetables */}
                  <div className="bg-white rounded-3xl p-8 shadow-lg">
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="text-2xl font-bold text-gray-900 flex items-center space-x-2">
                        <Plus className="h-6 w-6 text-green-500" />
                        <span>3. Add More Vegetables</span>
                      </h3>
                      <div className="flex items-center space-x-4">
                        {getCurrentVegetableCount() >= getCurrentPlan().maxLimit && (
                          <span className="text-sm text-red-600 font-medium">
                            {!isCustomizationAllowed ? 'Customization Closed' : 'Weekly Limit Reached'}
                          </span>
                        )}
                        <button
                          onClick={resetCustomizations}
                          disabled={!isCustomizationAllowed}
                          className={`flex items-center space-x-1 text-sm ${isCustomizationAllowed
                            ? 'text-green-600 hover:text-green-700'
                            : 'text-gray-400 cursor-not-allowed'
                            }`}
                        >
                          <RefreshCw className="h-4 w-4" />
                          <span>Reset All</span>
                        </button>
                      </div>
                    </div>

                    {/* Group vegetables by category */}
                    {(['root', 'leafy', 'bushy'] as const).map(category => {
                      const categoryVegetables = getAvailableVegetables().filter(v => v.category === category);
                      if (categoryVegetables.length === 0) return null;

                      const CategoryIcon = getCategoryIcon(category);

                      return (
                        <div key={category} className="mb-6">
                          <div className={`flex items-center space-x-2 mb-3 p-2 rounded-lg ${getCategoryColor(category)}`}>
                            <CategoryIcon className="h-5 w-5" />
                            <h4 className="font-semibold capitalize">{category} Vegetables</h4>
                          </div>

                          <div className="grid md:grid-cols-2 gap-3">
                            {categoryVegetables.map((vegetable) => {
                              const canAdd = canAddMoreOfCategory(category);
                              const plan = getCurrentPlan();
                              const hypotheticalAllocation = calculatePlanAllocation(
                                plan.vegetableBudget,
                                [...getCurrentVegetables(), vegetable.id],
                                vegetables,
                                plan.categoricalLimits,
                                plan.bucketTypeId,
                                plan.bucketTypeId ? bucketTypeRatiosFromDb[plan.bucketTypeId] : undefined
                              ).find(v => v.id === vegetable.id);

                              return (
                                <button
                                  key={vegetable.id}
                                  onClick={() => canAdd && toggleVegetableAddition(vegetable.id, category)}
                                  disabled={!canAdd}
                                  className={`p-4 rounded-xl border-2 text-left transition-all ${canAdd
                                    ? 'border-gray-200 hover:border-green-300'
                                    : 'border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed'
                                    }`}
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="flex-1">
                                      <h4 className="font-medium">{vegetable.name}</h4>
                                      <p className="text-sm text-gray-600">~{hypotheticalAllocation?.allocatedWeight || 0}g</p>
                                      <p className="text-xs text-green-600">
                                        Allocated: LKR {hypotheticalAllocation?.allocatedBudget || 0}
                                      </p>
                                      {!canAdd && (
                                        <p className="text-xs text-red-500 mt-1">
                                          {!isCustomizationAllowed ? 'Customization closed' : 'Weekly limit reached'}
                                        </p>
                                      )}
                                    </div>
                                    <div className="flex items-center space-x-2">
                                      {!canAdd && <Lock className="h-4 w-4 text-gray-400" />}
                                      {canAdd && <Plus className="h-4 w-4 text-green-500" />}
                                    </div>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Summary Sidebar */}
                <div className="lg:col-span-1">
                  <div className="bg-white rounded-3xl p-8 shadow-lg sticky top-8">
                    <h3 className="text-2xl font-bold text-gray-900 mb-6">Your Custom Leafy Bucket</h3>

                    <div className="space-y-4 mb-6">
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600">Plan:</span>
                        <span className="font-semibold">{getCurrentPlan().name}</span>
                      </div>

                      <div className="flex justify-between items-center">
                        <span className="text-gray-600">This Week:</span>
                        <span className={`font-semibold px-2 py-1 rounded-full text-sm ${getCurrentVegetableCount() >= getCurrentPlan().maxLimit
                          ? 'bg-red-100 text-red-800'
                          : 'bg-green-100 text-green-800'
                          }`}>
                          {getCurrentVegetableCount()}/{getCurrentPlan().maxLimit} vegetables
                        </span>
                      </div>

                      <div className="flex justify-between items-center">
                        <span className="text-gray-600">Total Weight:</span>
                        <span className="font-semibold text-blue-600">
                          {Math.round(getWeightBreakdown().totalWeight / 1000 * 10) / 10}kg
                        </span>
                      </div>

                      <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                        <span className="text-gray-900 font-bold">Total (Monthly):</span>
                        <span className="font-bold text-gray-900">
                          LKR {getCurrentPlan().fixedPrice.toLocaleString()}
                        </span>
                      </div>
                    </div>

                    {/* Budget Allocation Summary */}
                    <div className="mb-6 p-4 bg-gray-50 rounded-xl">
                      <h4 className="font-semibold text-gray-900 mb-3">Budget Distribution:</h4>
                      <div className="space-y-2">
                        {(['root', 'leafy', 'bushy'] as const).map(category => {
                          const allocation = getCurrentAllocation();
                          const categoryVegs = allocation.filter(v => v.category === category);
                          const categoryBudget = categoryVegs.reduce((sum, v) => sum + v.allocatedBudget, 0);
                          const Icon = getCategoryIcon(category);

                          if (categoryVegs.length === 0) return null;

                          return (
                            <div key={category} className="flex items-center justify-between">
                              <div className="flex items-center space-x-2">
                                <Icon className={`h-4 w-4 ${getCategoryColor(category).split(' ')[0]}`} />
                                <span className="text-sm capitalize">{category} ({categoryVegs.length})</span>
                              </div>
                              <div className="text-right">
                                <span className="font-semibold text-sm">LKR {categoryBudget}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Weight Allocation Summary */}
                    <div className="mb-6 p-4 bg-gray-50 rounded-xl">
                      <h4 className="font-semibold text-gray-900 mb-3">Weight Distribution:</h4>
                      <div className="space-y-2">
                        {(['root', 'leafy', 'bushy'] as const).map(category => {
                          const weightBreakdown = getWeightBreakdown();
                          const categoryWeight = weightBreakdown.breakdown[category].weight;
                          const categoryCount = weightBreakdown.breakdown[category].count;
                          const Icon = getCategoryIcon(category);

                          if (categoryCount === 0) return null;

                          return (
                            <div key={category} className="flex items-center justify-between">
                              <div className="flex items-center space-x-2">
                                <Icon className={`h-4 w-4 ${getCategoryColor(category).split(' ')[0]}`} />
                                <span className="text-sm capitalize">{category} ({categoryCount})</span>
                              </div>
                              <div className="text-right">
                                <span className="font-semibold text-sm">{categoryWeight}g</span>
                                <div className="text-xs text-gray-500">
                                  {weightBreakdown.percentages[category]}%
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="border-t border-gray-200 pt-6 mb-6">
                      <div className="text-center bg-green-50 rounded-2xl p-6">
                        <div className="text-sm text-green-700 mb-2">Fixed Monthly Price</div>
                        <div className="text-3xl font-bold text-green-600 mb-2">
                          LKR {getCurrentPlan().fixedPrice.toLocaleString()}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <button
                        onClick={handleStartSubscription}
                        disabled={!isCustomizationAllowed}
                        className={`w-full py-4 px-6 rounded-full font-semibold transition-colors ${isCustomizationAllowed
                          ? 'bg-green-600 text-white hover:bg-green-700'
                          : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                          }`}
                      >
                        {isCustomizationAllowed ? 'Start Smart Subscription' : 'Customization Closed'}
                      </button>
                      <button
                        onClick={handleSavePreferences}
                        disabled={!isCustomizationAllowed}
                        className={`w-full py-3 px-6 rounded-full font-semibold transition-colors ${isCustomizationAllowed
                          ? 'border-2 border-green-600 text-green-600 hover:bg-green-50'
                          : 'border-2 border-gray-300 text-gray-500 cursor-not-allowed'
                          }`}
                      >
                        Save Preferences
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
};

export default CustomizationPage;