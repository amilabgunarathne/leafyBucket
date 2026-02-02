import React from 'react';
import { Check, Star, Package, Leaf, TreePine, Flower } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { vegetables, calculatePlanAllocation, defaultPlanVegetables, CATEGORY_VALUES, Vegetable } from '../data/vegetables';
import VegetableService from '../services/vegetableService';

const Pricing = () => {
  const { user } = useAuth();
  const [activeVegetables, setActiveVegetables] = React.useState<Vegetable[]>([]);
  const vegetableService = VegetableService.getInstance();

  React.useEffect(() => {
    const init = async () => {
      await vegetableService.initialize();
      setActiveVegetables(vegetableService.getActiveVegetables());
    };
    init();
  }, []);

  const handleStartSubscription = () => {
    if (user) {
      // User is logged in, go to subscription page
      window.location.href = '/subscription';
    } else {
      // User not logged in, go to auth page
      window.location.href = '/auth';
    }
  };

  const plans = [
    {
      name: "Small Family",
      price: "2,900",
      description: "Perfect for 1-2 people",
      vegetableCount: "4",
      weight: "1.5-2 kg",
      vegetableBudget: "2,200",
      handlingFee: "700",
      features: [
        "4 varieties of vegetables",
        "1.5-2 kg of fresh produce",
        "Weekly delivery",
        "Free delivery",
        "Seasonal recipe cards"
      ],
      popular: false,
      planId: 'small'
    },
    {
      name: "Medium Family",
      price: "4,900",
      description: "Great for 3-4 people",
      vegetableCount: "7",
      weight: "3-4 kg",
      vegetableBudget: "4,000",
      handlingFee: "900",
      features: [
        "7 varieties of vegetables",
        "3-4 kg of fresh produce",
        "Weekly delivery",
        "Free delivery",
        "Seasonal recipe cards",
        "Priority customer support"
      ],
      popular: true,
      planId: 'medium'
    },
    {
      name: "Large Family",
      price: "6,900",
      description: "Ideal for 5+ people",
      vegetableCount: "10",
      weight: "5-6 kg",
      vegetableBudget: "5,700",
      handlingFee: "1,200",
      features: [
        "10 varieties of vegetables",
        "5-6 kg of fresh produce",
        "Weekly delivery",
        "Free delivery",
        "Seasonal recipe cards",
        "Priority customer support",
        "Exclusive chef recipes"
      ],
      popular: false,
      planId: 'large'
    }
  ];

  // Get category icons
  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'root': return TreePine;
      case 'leafy': return Leaf;
      case 'bushy': return Flower;
      default: return Package;
    }
  };

  // Get category color
  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'root': return 'text-orange-600 bg-orange-100';
      case 'leafy': return 'text-green-600 bg-green-100';
      case 'bushy': return 'text-purple-600 bg-purple-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  return (
    <section id="pricing" className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center space-y-4 mb-16">
          <h2 className="text-4xl font-bold text-gray-900">Simple Fixed Pricing</h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Choose your plan and enjoy fresh vegetables delivered weekly. Our smart system automatically balances variety and value within your fixed monthly price.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 mb-12">
          {plans.map((plan, index) => {
            const planVegetables = defaultPlanVegetables[plan.planId];
            const allocation = calculatePlanAllocation(
              parseInt(plan.vegetableBudget.replace(',', '')),
              planVegetables,
              activeVegetables // Pass dynamic vegetables list
            );

            return (
              <div key={index} className={`rounded-3xl p-8 ${plan.popular ? 'bg-green-600 text-white ring-4 ring-green-200 scale-105' : 'bg-gray-50'} relative`}>
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                    <div className="bg-orange-500 text-white px-4 py-2 rounded-full text-sm font-semibold flex items-center space-x-1">
                      <Star className="h-4 w-4 fill-current" />
                      <span>Most Popular</span>
                    </div>
                  </div>
                )}

                <div className="text-center mb-8">
                  <h3 className={`text-2xl font-bold mb-2 ${plan.popular ? 'text-white' : 'text-gray-900'}`}>{plan.name}</h3>
                  <p className={`${plan.popular ? 'text-green-100' : 'text-gray-600'} mb-4`}>{plan.description}</p>

                  {/* Vegetable Count and Weight Highlight */}
                  <div className="space-y-2 mb-4">
                    <div className={`inline-flex items-center space-x-2 px-4 py-2 rounded-full ${plan.popular ? 'bg-green-500 text-white' : 'bg-green-100 text-green-700'
                      }`}>
                      <Package className="h-5 w-5" />
                      <span className="font-semibold">{plan.vegetableCount} vegetables</span>
                    </div>
                    <div className={`text-sm font-medium ${plan.popular ? 'text-green-100' : 'text-gray-600'}`}>
                      Total weight: {plan.weight}
                    </div>
                  </div>

                  <div className="flex items-baseline justify-center">
                    <span className={`text-lg mr-1 ${plan.popular ? 'text-green-100' : 'text-gray-600'}`}>LKR</span>
                    <span className={`text-5xl font-bold ${plan.popular ? 'text-white' : 'text-gray-900'}`}>{plan.price}</span>
                    <span className={`text-lg ml-2 ${plan.popular ? 'text-green-100' : 'text-gray-600'}`}>/month</span>
                  </div>

                  {/* Budget Breakdown */}
                  <div className={`mt-4 p-3 rounded-xl ${plan.popular ? 'bg-green-500' : 'bg-white border border-gray-200'}`}>
                    <div className={`text-xs ${plan.popular ? 'text-green-100' : 'text-gray-600'} space-y-1`}>
                      <div className="flex justify-between">
                        <span>Vegetables:</span>
                        <span className="font-semibold">LKR {plan.vegetableBudget}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Handling:</span>
                        <span className="font-semibold">LKR {plan.handlingFee}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Category Breakdown */}
                <div className={`mb-6 p-4 rounded-xl ${plan.popular ? 'bg-green-500' : 'bg-white border border-gray-200'}`}>
                  <h4 className={`text-sm font-semibold mb-3 ${plan.popular ? 'text-green-100' : 'text-gray-700'}`}>
                    Value Distribution by Category:
                  </h4>
                  <div className="space-y-2">
                    {['root', 'leafy', 'bushy'].map(category => {
                      const categoryVegs = allocation.filter(v => v.category === category);
                      const categoryBudget = categoryVegs.reduce((sum, v) => sum + v.allocatedBudget, 0);
                      const categoryCount = categoryVegs.length;

                      if (categoryCount === 0) return null;

                      const Icon = getCategoryIcon(category);

                      return (
                        <div key={category} className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <Icon className={`h-4 w-4 ${plan.popular ? 'text-green-200' : getCategoryColor(category).split(' ')[0]}`} />
                            <span className={`text-xs ${plan.popular ? 'text-green-100' : 'text-gray-600'}`}>
                              {categoryCount} {category}
                            </span>
                          </div>
                          <span className={`text-xs font-semibold ${plan.popular ? 'text-green-100' : 'text-gray-700'}`}>
                            LKR {categoryBudget}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <ul className="space-y-4 mb-8">
                  {plan.features.map((feature, featureIndex) => (
                    <li key={featureIndex} className="flex items-start space-x-3">
                      <Check className={`h-5 w-5 mt-0.5 ${plan.popular ? 'text-green-200' : 'text-green-600'} flex-shrink-0`} />
                      <span className={`${plan.popular ? 'text-green-50' : 'text-gray-700'}`}>{feature}</span>
                    </li>
                  ))}
                </ul>

                <button
                  onClick={handleStartSubscription}
                  className={`w-full py-4 px-6 rounded-full font-semibold transition-all duration-200 ${plan.popular
                      ? 'bg-white text-green-600 hover:bg-gray-100'
                      : 'bg-green-600 text-white hover:bg-green-700'
                    }`}
                >
                  Start Subscription
                </button>
              </div>
            );
          })}
        </div>

        {/* Detailed Breakdown */}
        <div className="bg-white border-2 border-green-100 rounded-3xl p-8">
          <h3 className="text-xl font-bold text-gray-900 text-center mb-6">Typical Weekly Allocation Examples</h3>
          <div className="grid md:grid-cols-3 gap-8 text-sm">
            {plans.map((plan) => {
              const planVegetables = defaultPlanVegetables[plan.planId];
              const allocation = calculatePlanAllocation(
                parseInt(plan.vegetableBudget.replace(',', '')),
                planVegetables,
                activeVegetables
              );

              return (
                <div key={plan.planId}>
                  <h4 className="font-semibold text-green-600 mb-3">{plan.name}</h4>
                  <div className="bg-green-50 p-4 rounded-lg mb-3">
                    <div className="text-xs text-green-700 space-y-1">
                      <div>Budget: LKR {plan.vegetableBudget} for vegetables</div>
                      <div>Handling fee: LKR {plan.handlingFee}</div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {allocation.map(veg => {
                      const Icon = getCategoryIcon(veg.category);
                      return (
                        <div key={veg.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                          <div className="flex items-center space-x-2">
                            <Icon className={`h-3 w-3 ${getCategoryColor(veg.category).split(' ')[0]}`} />
                            <span className="text-xs">{veg.name}</span>
                          </div>
                          <div className="text-right">
                            <div className="text-xs font-semibold">LKR {veg.allocatedBudget}</div>
                            <div className="text-xs text-gray-500">{veg.typicalWeight}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="text-center space-y-4 mt-8">
          <p className="text-gray-600">
            All plans include free delivery and can be paused or cancelled anytime.
          </p>
          <p className="text-sm text-gray-500">
            No setup fees • No contracts • 100% satisfaction guarantee
          </p>
        </div>
      </div>
    </section>
  );
};

export default Pricing;