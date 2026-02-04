import React, { useState } from 'react';
import { ArrowLeft, Check, X, Plus, Minus, Settings, AlertCircle, Calendar, Package, Wallet, RefreshCw, TrendingUp, Lock, Shield, TreePine, Leaf, Flower, Scale, Clock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Vegetable, calculatePlanAllocation, defaultPlanVegetables, CATEGORY_VALUES, calculateTotalPlanWeight, getWeightBreakdownByCategory } from '../data/vegetables';
import VegetableService from '../services/vegetableService';
import { useWeekly } from '../contexts/WeeklyContext';
import WeeklyScheduleInfo from '../components/WeeklyScheduleInfo';
import WeeklyVegetableDisplay from '../components/WeeklyVegetableDisplay';

const CustomizationPage = () => {
  const [selectedPlan, setSelectedPlan] = useState<string>('medium');
  const [customizations, setCustomizations] = useState<{
    excludedVegetables: string[];
    removedVegetables: string[];
    addedVegetables: string[];
    deliveryDay: string;
  }>({
    excludedVegetables: [],
    removedVegetables: [],
    addedVegetables: [],
    deliveryDay: 'sunday'
  });

  const [vegetables, setVegetables] = useState<Vegetable[]>([]);
  const vegetableService = VegetableService.getInstance();

  React.useEffect(() => {
    const fetchVegetables = async () => {
      await vegetableService.initialize();
      setVegetables(vegetableService.getAllVegetables());
    };
    fetchVegetables();
  }, []);

  const { isCustomizationAllowed, timeRemaining } = useWeekly();

  // ADMIN-CONTROLLED WEEKLY LIMITS (simulating admin dashboard settings)
  const WEEKLY_ADMIN_LIMITS = {
    small: {
      current: 4,
      range: [3, 5],
      fixedPrice: 2900,
      vegetableBudget: 2200
    },
    medium: {
      current: 7,
      range: [6, 8],
      fixedPrice: 4900,
      vegetableBudget: 4000
    },
    large: {
      current: 10,
      range: [8, 12],
      fixedPrice: 6900,
      vegetableBudget: 5700
    }
  };

  // Base plan configurations with FIXED PRICING
  const basePlans = {
    small: {
      name: 'Small Family',
      defaultVegetableCount: 4,
      description: 'Perfect for 1-2 people',
      fixedPrice: WEEKLY_ADMIN_LIMITS.small.fixedPrice
    },
    medium: {
      name: 'Medium Family',
      defaultVegetableCount: 7,
      description: 'Great for 3-4 people',
      fixedPrice: WEEKLY_ADMIN_LIMITS.medium.fixedPrice
    },
    large: {
      name: 'Large Family',
      defaultVegetableCount: 10,
      description: 'Ideal for 5+ people',
      fixedPrice: WEEKLY_ADMIN_LIMITS.large.fixedPrice
    }
  };

  // Get current week's admin-set limits
  const getCurrentWeekLimits = () => {
    return WEEKLY_ADMIN_LIMITS[selectedPlan as keyof typeof WEEKLY_ADMIN_LIMITS];
  };

  // Calculate current vegetable count in bucket
  const getCurrentVegetableCount = () => {
    const defaultVegs = getDefaultVegetables();
    const finalCount = defaultVegs.length - customizations.removedVegetables.length + customizations.addedVegetables.length;
    return finalCount;
  };

  const getCurrentPlan = () => {
    const basePlan = basePlans[selectedPlan as keyof typeof basePlans];
    const weekLimits = getCurrentWeekLimits();

    return {
      ...basePlan,
      currentVegetableCount: getCurrentVegetableCount(),
      maxLimit: weekLimits.current,
      adminRange: weekLimits.range,
      fixedPrice: weekLimits.fixedPrice,
      vegetableBudget: weekLimits.vegetableBudget
    };
  };

  const getDefaultVegetables = () => defaultPlanVegetables[selectedPlan as keyof typeof defaultPlanVegetables];

  const getCurrentVegetables = () => {
    const defaultVegs = getDefaultVegetables();
    const finalVegetables = defaultVegs
      .filter(vegId => !customizations.removedVegetables.includes(vegId))
      .concat(customizations.addedVegetables);
    return finalVegetables;
  };

  const getAvailableVegetables = () => {
    const currentVegetables = getCurrentVegetables();
    return vegetables.filter(veg => !currentVegetables.includes(veg.id));
  };

  // Check if we can add more vegetables (within admin-set limit)
  const canAddMoreVegetables = () => {
    return getCurrentVegetableCount() < getCurrentPlan().maxLimit && isCustomizationAllowed;
  };

  const getRemainingSlots = () => {
    return getCurrentPlan().maxLimit - getCurrentVegetableCount();
  };

  const toggleVegetableRemoval = (vegetableId: string) => {
    if (!isCustomizationAllowed) return;

    setCustomizations(prev => {
      const isCurrentlyRemoved = prev.removedVegetables.includes(vegetableId);

      if (isCurrentlyRemoved) {
        return {
          ...prev,
          removedVegetables: prev.removedVegetables.filter(id => id !== vegetableId)
        };
      } else {
        return {
          ...prev,
          removedVegetables: [...prev.removedVegetables, vegetableId]
        };
      }
    });
  };

  const toggleVegetableAddition = (vegetableId: string) => {
    if (!isCustomizationAllowed) return;

    setCustomizations(prev => {
      const isCurrentlyAdded = prev.addedVegetables.includes(vegetableId);

      if (isCurrentlyAdded) {
        return {
          ...prev,
          addedVegetables: prev.addedVegetables.filter(id => id !== vegetableId)
        };
      } else {
        if (canAddMoreVegetables()) {
          return {
            ...prev,
            addedVegetables: [...prev.addedVegetables, vegetableId]
          };
        }
        return prev;
      }
    });
  };

  const toggleVegetableExclusion = (vegetableId: string) => {
    if (!isCustomizationAllowed) return;

    setCustomizations(prev => ({
      ...prev,
      excludedVegetables: prev.excludedVegetables.includes(vegetableId)
        ? prev.excludedVegetables.filter(id => id !== vegetableId)
        : [...prev.excludedVegetables, vegetableId]
    }));
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

  // Calculate current allocation
  const getCurrentAllocation = () => {
    const currentVegetables = getCurrentVegetables();
    const currentPlan = getCurrentPlan();
    return calculatePlanAllocation(currentPlan.vegetableBudget, currentVegetables, vegetables);
  };

  // Calculate weight breakdown
  const getWeightBreakdown = () => {
    const currentVegetables = getCurrentVegetables();
    return getWeightBreakdownByCategory(currentVegetables, vegetables);
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
              <span className="font-semibold text-green-700">Fixed monthly pricing, smart value & weight allocation!</span>
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
                      Opens Wednesday 00:01. Closes Friday end (Saturday 00:00).
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
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-4 gap-8">
            {/* Weekly Schedule Sidebar */}
            <div className="lg:col-span-1">
              <div className="space-y-6">
                <WeeklyScheduleInfo />
                <WeeklyVegetableDisplay planId={selectedPlan as 'small' | 'medium' | 'large'} showShuffleButton={true} />
              </div>
            </div>

            {/* Main Customization Content */}
            <div className="lg:col-span-2 space-y-8">
              {/* Base Plan Selection */}
              <div className="bg-white rounded-3xl p-8 shadow-lg">
                <h3 className="text-2xl font-bold text-gray-900 mb-6">1. Choose Your Fixed-Price Plan</h3>

                <div className="grid md:grid-cols-3 gap-4">
                  {(Object.entries(basePlans) as [string, typeof basePlans['small']][]).map(([planId, plan]) => {
                    const weekLimits = WEEKLY_ADMIN_LIMITS[planId as keyof typeof WEEKLY_ADMIN_LIMITS];
                    const defaultVegs = defaultPlanVegetables[planId as keyof typeof defaultPlanVegetables];
                    const totalWeight = calculateTotalPlanWeight(defaultVegs, vegetables);

                    return (
                      <div
                        key={planId}
                        onClick={() => isCustomizationAllowed && setSelectedPlan(planId)}
                        className={`p-4 rounded-2xl border-2 transition-all ${selectedPlan === planId
                          ? 'border-green-600 bg-green-50'
                          : isCustomizationAllowed
                            ? 'border-gray-200 hover:border-green-300 cursor-pointer'
                            : 'border-gray-200 opacity-50 cursor-not-allowed'
                          }`}
                      >
                        <h4 className="font-semibold text-gray-900">{plan.name}</h4>
                        <p className="text-2xl font-bold text-green-600">LKR {plan.fixedPrice.toLocaleString()}</p>
                        <p className="text-sm text-gray-600">{plan.description}</p>
                        <p className="text-sm text-gray-600">~{Math.round(totalWeight / 1000 * 10) / 10}kg total</p>

                        <div className="mt-2 p-2 bg-blue-50 rounded-lg">
                          <div className="flex items-center space-x-1">
                            <Package className="h-3 w-3 text-blue-600" />
                            <span className="text-xs text-blue-700 font-medium">
                              This week: Up to {weekLimits.current} vegetables
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Current Bucket Contents */}
              <div className="bg-white rounded-3xl p-8 shadow-lg">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-2xl font-bold text-gray-900">2. Your Weekly Leafy Bucket</h3>
                  <div className="text-sm text-gray-600">
                    {getCurrentVegetableCount()}/{getCurrentPlan().maxLimit} vegetables this week
                  </div>
                </div>

                {!isCustomizationAllowed && (
                  <div className="mb-6 p-4 bg-orange-50 border-2 border-orange-200 rounded-xl">
                    <div className="flex items-center space-x-3">
                      <Clock className="h-5 w-5 text-orange-600" />
                      <div>
                        <div className="font-semibold text-orange-900">Customization Period Ended</div>
                        <div className="text-sm text-orange-700">
                          This week's selection is finalized. Changes will be available next Wednesday.
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Weight & Value Allocation Summary */}
                <div className="mb-6 p-4 bg-gradient-to-r from-green-50 to-orange-50 rounded-xl">
                  <h4 className="font-semibold text-gray-900 mb-3">Smart Value & Weight Allocation</h4>

                  {/* Total Weight Display */}
                  <div className="mb-4 p-3 bg-white rounded-lg border-2 border-blue-200">
                    <div className="flex items-center justify-center space-x-2">
                      <Scale className="h-5 w-5 text-blue-600" />
                      <span className="text-lg font-bold text-blue-600">
                        Total Weight: {Math.round(getWeightBreakdown().totalWeight)}g
                        ({Math.round(getWeightBreakdown().totalWeight / 1000 * 10) / 10}kg)
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4 text-center">
                    {(['root', 'leafy', 'bushy'] as const).map(category => {
                      const allocation = getCurrentAllocation();
                      const weightBreakdown = getWeightBreakdown();
                      const categoryVegs = allocation.filter(v => v.category === category);
                      const categoryBudget = categoryVegs.reduce((sum, v) => sum + v.allocatedBudget, 0);
                      const categoryWeight = weightBreakdown.breakdown[category].weight;
                      const Icon = getCategoryIcon(category);

                      return (
                        <div key={category} className={`p-3 rounded-lg ${getCategoryColor(category)}`}>
                          <Icon className="h-6 w-6 mx-auto mb-2" />
                          <div className="text-sm font-medium capitalize">{category}</div>
                          <div className="text-lg font-bold">LKR {categoryBudget}</div>
                          <div className="text-xs">{categoryVegs.length} vegetables</div>
                          <div className="text-xs font-medium mt-1">
                            {categoryWeight}g ({Math.round(categoryWeight / 10) / 100}kg)
                          </div>
                          <div className="text-xs">
                            {weightBreakdown.percentages[category]}% of weight
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  {getDefaultVegetables()
                    .filter(vegId => !customizations.removedVegetables.includes(vegId))
                    .map((vegetableId) => {
                      const vegetable = vegetables.find(v => v.id === vegetableId);
                      const allocation = getCurrentAllocation().find(v => v.id === vegetableId);
                      const CategoryIcon = getCategoryIcon(vegetable?.category);

                      return (
                        <div
                          key={vegetableId}
                          className="p-4 rounded-xl border-2 border-green-200 bg-green-50 transition-all"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="flex items-center space-x-2 mb-1">
                                <h4 className="font-semibold text-gray-900">{vegetable?.name}</h4>
                                <CategoryIcon className={`h-4 w-4 ${getCategoryColor(vegetable?.category).split(' ')[0]}`} />
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
                    const allocation = getCurrentAllocation().find(v => v.id === vegetableId);
                    const CategoryIcon = getCategoryIcon(vegetable?.category);

                    return (
                      <div
                        key={vegetableId}
                        className="p-4 rounded-xl border-2 border-blue-200 bg-blue-50 transition-all"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center space-x-2 mb-1">
                              <h4 className="font-semibold text-gray-900">{vegetable?.name}</h4>
                              <CategoryIcon className={`h-4 w-4 ${getCategoryColor(vegetable?.category).split(' ')[0]}`} />
                            </div>
                            <p className="text-sm text-gray-600">~{allocation?.allocatedWeight || 0}g</p>
                            <p className="text-xs text-blue-600">
                              ADDED • Allocated: LKR {allocation?.allocatedBudget || 0}
                            </p>
                          </div>
                          <button
                            onClick={() => toggleVegetableAddition(vegetableId)}
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
                    {!canAddMoreVegetables() && (
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
                        <h4 className="font-semibold capitalize">{category} Vegetables (Value: {CATEGORY_VALUES[category]})</h4>
                      </div>

                      <div className="grid md:grid-cols-2 gap-3">
                        {categoryVegetables.map((vegetable) => {
                          const canAdd = canAddMoreVegetables();

                          return (
                            <button
                              key={vegetable.id}
                              onClick={() => canAdd && toggleVegetableAddition(vegetable.id)}
                              disabled={!canAdd}
                              className={`p-4 rounded-xl border-2 text-left transition-all ${canAdd
                                ? 'border-gray-200 hover:border-green-300'
                                : 'border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed'
                                }`}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex-1">
                                  <h4 className="font-medium">{vegetable.name}</h4>
                                  <p className="text-sm text-gray-600">~{Math.round(vegetable.weightPerValuePoint * vegetable.baseValue)}g</p>
                                  <p className="text-xs text-green-600">Value: {vegetable.baseValue} points</p>
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

              {/* Exclude Vegetables - commented out for now */}
              {/* <div className="bg-white rounded-3xl p-8 shadow-lg">
                <h3 className="text-2xl font-bold text-gray-900 mb-6">4. Exclude Vegetables</h3>

                {!isCustomizationAllowed && (
                  <div className="mb-4 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                    <p className="text-sm text-orange-800">
                      Exclusion preferences are locked until next Wednesday.
                    </p>
                  </div>
                )}

                <div className="grid md:grid-cols-2 gap-3">
                  {vegetables.map((vegetable) => {
                    const CategoryIcon = getCategoryIcon(vegetable.category);

                    return (
                      <button
                        key={vegetable.id}
                        onClick={() => toggleVegetableExclusion(vegetable.id)}
                        disabled={!isCustomizationAllowed}
                        className={`p-3 rounded-xl border-2 text-left transition-all ${customizations.excludedVegetables.includes(vegetable.id)
                          ? 'border-red-600 bg-red-50 text-red-800'
                          : isCustomizationAllowed
                            ? 'border-gray-200 hover:border-red-300'
                            : 'border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed'
                          }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <CategoryIcon className={`h-4 w-4 ${getCategoryColor(vegetable.category).split(' ')[0]}`} />
                            <span className="font-medium">{vegetable.name}</span>
                          </div>
                          {customizations.excludedVegetables.includes(vegetable.id) && (
                            <X className="h-4 w-4 text-red-500" />
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div> */}
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

                {/* Value Allocation Summary */}
                <div className="mb-6 p-4 bg-gray-50 rounded-xl">
                  <h4 className="font-semibold text-gray-900 mb-3">Value Allocation:</h4>
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
                          <span className="font-semibold text-sm">LKR {categoryBudget}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Fixed Price Display */}
                <div className="border-t border-gray-200 pt-6 mb-6">
                  <div className="text-center bg-green-50 rounded-2xl p-6">
                    <div className="text-sm text-green-700 mb-2">Fixed Monthly Price</div>
                    <div className="text-3xl font-bold text-green-600 mb-2">
                      LKR {getCurrentPlan().fixedPrice.toLocaleString()}
                    </div>
                    <div className="text-xs text-green-600">
                      Smart value & weight allocation
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <button
                    disabled={!isCustomizationAllowed}
                    className={`w-full py-4 px-6 rounded-full font-semibold transition-colors ${isCustomizationAllowed
                      ? 'bg-green-600 text-white hover:bg-green-700'
                      : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      }`}
                  >
                    {isCustomizationAllowed ? 'Start Smart Subscription' : 'Customization Closed'}
                  </button>
                  <button
                    disabled={!isCustomizationAllowed}
                    className={`w-full py-3 px-6 rounded-full font-semibold transition-colors ${isCustomizationAllowed
                      ? 'border-2 border-green-600 text-green-600 hover:bg-green-50'
                      : 'border-2 border-gray-300 text-gray-500 cursor-not-allowed'
                      }`}
                  >
                    Save Preferences
                  </button>
                </div>

                <div className="mt-6 p-4 bg-blue-50 rounded-xl">
                  <div className="flex items-start space-x-2">
                    <Shield className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm text-blue-800 font-medium">Smart Allocation System</p>
                      <p className="text-xs text-blue-700 mt-1">
                        Our system automatically allocates budget (4:2:3 ratio) and calculates weights based on vegetable categories for optimal value and quantity.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default CustomizationPage;