import React from 'react';
import { ArrowLeft, Leaf, MapPin, Calendar, Package, TreePine, Flower } from 'lucide-react';
import { Link } from 'react-router-dom';
import { calculatePlanAllocation, defaultPlanVegetables, Vegetable } from '../data/vegetables';
import VegetableService from '../services/vegetableService';

const ProductsPage = () => {
  const [activeVegetables, setActiveVegetables] = React.useState<Vegetable[]>([]);
  const vegetableService = VegetableService.getInstance();

  React.useEffect(() => {
    const init = async () => {
      await vegetableService.initialize();
      setActiveVegetables(vegetableService.getActiveVegetables());
    };
    init();
  }, []);

  type PlanId = 'small' | 'medium' | 'large';

  const plans: {
    name: string;
    vegetableBudget: string;
    handlingFee: string;
    planId: PlanId;
  }[] = [
      {
        name: "Small Family",
        vegetableBudget: "2,200",
        handlingFee: "700",
        planId: 'small'
      },
      {
        name: "Medium Family",
        vegetableBudget: "4,000",
        handlingFee: "900",
        planId: 'medium'
      },
      {
        name: "Large Family",
        vegetableBudget: "5,700",
        handlingFee: "1,200",
        planId: 'large'
      }
    ];

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

  return (
    <div className="pt-16">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-green-50 via-white to-orange-50 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center space-y-6 mb-12">
            <Link
              to="/"
              className="inline-flex items-center space-x-2 text-green-600 hover:text-green-700 transition-colors mb-4"
            >
              <ArrowLeft className="h-5 w-5" />
              <span>Back to Home</span>
            </Link>

            <h1 className="text-5xl lg:text-6xl font-bold text-gray-900 leading-tight">
              What's in Your
              <span className="text-green-600"> Leafy Bucket</span>
            </h1>
            Discover the fresh vegetables we carefully select from local farms in Bandarawela and the surrounding hill country. Each week brings a curated selection of seasonal produce.
          </div>

          <div className="grid lg:grid-cols-3 gap-8 mb-16">
            <div className="bg-white rounded-2xl p-6 shadow-lg text-center">
              <Leaf className="h-12 w-12 text-green-600 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-gray-900 mb-2">100% Fresh</h3>
              <p className="text-gray-600">All vegetables grown using traditional hilltop farming methods</p>
            </div>
            <div className="bg-white rounded-2xl p-6 shadow-lg text-center">
              <MapPin className="h-12 w-12 text-orange-600 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-gray-900 mb-2">Locally Sourced</h3>
              <p className="text-gray-600">Fresh from Bandarawela hill country farms</p>
            </div>
            <div className="bg-white rounded-2xl p-6 shadow-lg text-center">
              <Calendar className="h-12 w-12 text-blue-600 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-gray-900 mb-2">Seasonal Selection</h3>
              <p className="text-gray-600">Curated weekly based on peak freshness</p>
            </div>
          </div>
        </div>
      </section>

      {/* Typical Weekly Allocation Examples */}
      <section className="py-16 bg-gray-50 border-y border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-white border-2 border-green-100 rounded-3xl p-8 shadow-sm">
            <h3 className="text-2xl font-bold text-gray-900 text-center mb-10">Typical Weekly Allocation Examples</h3>
            <div className="grid lg:grid-cols-3 gap-12">
              {plans.map((plan) => {
                const planVegetables = defaultPlanVegetables[plan.planId];
                const allocation = calculatePlanAllocation(
                  parseInt(plan.vegetableBudget.replace(',', '')),
                  planVegetables,
                  activeVegetables
                );

                return (
                  <div key={plan.planId} className="flex flex-col">
                    <div className="mb-6">
                      <h4 className="text-xl font-bold text-green-600 mb-2">{plan.name}</h4>
                      <div className="inline-flex flex-col p-3 bg-green-50 rounded-xl w-full">
                        <div className="text-xs text-green-700 font-medium">Vegetables: LKR {plan.vegetableBudget}</div>
                        <div className="text-xs text-green-700 font-medium">Handling: LKR {plan.handlingFee}</div>
                      </div>
                    </div>
                    <div className="space-y-3 flex-grow">
                      {allocation.map(veg => {
                        const Icon = getCategoryIcon(veg.category);
                        return (
                          <div key={veg.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100 transition-hover hover:border-green-200">
                            <div className="flex items-center space-x-3">
                              <div className={`p-2 rounded-lg ${getCategoryColor(veg.category)}`}>
                                <Icon className="h-4 w-4" />
                              </div>
                              <span className="text-sm font-medium text-gray-700">{veg.name}</span>
                            </div>
                            <div className="text-right">
                              <div className="text-xs font-bold text-gray-900">LKR {veg.allocatedBudget}</div>
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
        </div>
      </section>

      {/* Farm Information */}
      <section className="py-16 bg-green-600 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold mb-6">Fresh from Bandarawela Hill Country!</h2>
          Our vegetables are grown in the cool, fertile climate of Bandarawela, where traditional farming methods meet sustainable practices. The high altitude and rich soil create perfect conditions for nutrient-dense vegetables with authentic Sri Lankan flavors.

          <div className="grid md:grid-cols-3 gap-8 mb-8">
            <div className="text-center">
              <div className="text-3xl font-bold mb-2">1,200m</div>
              <div className="text-green-100">Above Sea Level</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold mb-2">15+</div>
              <div className="text-green-100">Local Farm Partners</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold mb-2">100%</div>
              <div className="text-green-100">Freshness Guaranteed</div>
            </div>
          </div>

          <div className="space-y-4 sm:space-y-0 sm:space-x-4 sm:flex sm:justify-center">
            <Link
              to="/customize"
              className="inline-block bg-white text-green-600 px-8 py-3 rounded-full font-semibold hover:bg-gray-100 transition-colors"
            >
              Customize Your Leafy Bucket
            </Link>
            <Link
              to="/#pricing"
              className="inline-block border-2 border-white text-white px-8 py-3 rounded-full font-semibold hover:bg-white hover:text-green-600 transition-colors"
            >
              View Pricing Plans
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
};

export default ProductsPage;