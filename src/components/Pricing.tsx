import { Star, Package, Check } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const Pricing = () => {
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

  type PlanId = 'small' | 'medium' | 'large';

  const plans: {
    name: string;
    price: string;
    description: string;
    vegetableCount: string;
    weight: string;
    vegetableBudget: string;
    handlingFee: string;
    features: string[];
    popular: boolean;
    planId: PlanId;
  }[] = [
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
                  Select Bucket
                </button>
              </div>
            );
          })}
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
    </section >
  );
};

export default Pricing;