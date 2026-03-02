import React from 'react';
import { Star, Package, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const Pricing = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleStartSubscription = () => {
    if (user) {
      // Logged in: go to My Bucket with flag so they can choose a plan (no redirect back to Pricing)
      navigate('/my-account', { state: { fromPricing: true } });
    } else {
      navigate('/auth');
    }
  };

  const [plans, setPlans] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const fetchPlans = async () => {
      try {
        const { default: SubscriptionService } = await import('../services/SubscriptionService');
        const bucketTypes = await SubscriptionService.getInstance().getBucketTypes();

        const mappedPlans = bucketTypes.map(bt => ({
          name: bt.name + (bt.name === 'Mini' ? ' Family' : bt.name === 'Family' ? '' : ' Family'),
          price: bt.monthly_price.toLocaleString(),
          description: bt.description,
          vegetableRange: bt.display_item_range || '4', // e.g. "3-4", "6-7", "9-10"
          weight: "TBD",
          vegetableBudget: (bt.monthly_price - bt.handling_fee).toLocaleString(),
          features: [
            "4 deliveries (1 each week) per month",
            `${bt.display_item_range || '4'} vegetables weekly`,
            "Free weekly delivery",
            "Seasonal recipe cards"
          ],
          popular: bt.name === 'Family', // Hardcode popular for now or add flag to DB
          planId: bt.name.toLowerCase() === 'mini' ? 'small' : bt.name.toLowerCase() === 'family' ? 'medium' : 'large'
        }));

        setPlans(mappedPlans);
      } catch (error) {
        console.error("Error loading plans:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchPlans();
  }, []);

  if (loading) {
    return <div className="py-20 text-center">Loading plans...</div>;
  }


  return (
    <section id="pricing" className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center space-y-4 mb-16">
          <h2 className="text-4xl font-bold text-gray-900">Simple Fixed Pricing</h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            The price is per month and includes <strong>4 deliveries</strong>—one fresh box every week. Choose your plan and enjoy variety within your fixed monthly price.
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
                      <span className="font-semibold">{plan.vegetableRange} vegetables</span>
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
                  <p className={`text-sm mt-2 ${plan.popular ? 'text-green-100' : 'text-gray-500'}`}>
                    4 deliveries
                  </p>

                </div>

                <ul className="space-y-4 mb-8">
                  {plan.features.map((feature: string, featureIndex: number) => (
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