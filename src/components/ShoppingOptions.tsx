import { Package, ShoppingCart, ArrowRight, Check, Star } from 'lucide-react';
import { Link } from 'react-router-dom';

const ShoppingOptions = () => {
  return (
    <section id="shopping-options" className="py-20 bg-gradient-to-br from-green-50 to-orange-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center space-y-4 mb-16">
          <h2 className="text-4xl font-bold text-gray-900">Choose Your Shopping Style</h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            We understand everyone has different preferences. That's why we offer two convenient ways to get fresh vegetables from Bandarawela farms.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-8 mb-12 pt-8">
          {/* Individual Shopping Option */}
          <div className="bg-white rounded-3xl p-8 shadow-lg relative group hover:shadow-xl transition-all duration-300">
            <div className="mb-6">
              <div className="bg-green-100 rounded-full p-4 inline-flex items-center justify-center mb-4">
                <ShoppingCart className="h-8 w-8 text-green-600" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-3">Shop Individual Items</h3>
              <p className="text-gray-600 leading-relaxed">
                Prefer to choose exactly what you want? Shop our fresh vegetables individually and build your perfect order with complete control.
              </p>
            </div>

            <div className="space-y-3 mb-8">
              <div className="flex items-center space-x-3">
                <Check className="h-5 w-5 text-green-600 flex-shrink-0" />
                <span className="text-gray-700">Choose your own vegetables</span>
              </div>
              <div className="flex items-center space-x-3">
                <Check className="h-5 w-5 text-green-600 flex-shrink-0" />
                <span className="text-gray-700">Select exact quantities</span>
              </div>
              <div className="flex items-center space-x-3">
                <Check className="h-5 w-5 text-green-600 flex-shrink-0" />
                <span className="text-gray-700">Order when you want</span>
              </div>
              <div className="flex items-center space-x-3">
                <Check className="h-5 w-5 text-green-600 flex-shrink-0" />
                <span className="text-gray-700">Same fresh quality</span>
              </div>
              <div className="flex items-center space-x-3">
                <Check className="h-5 w-5 text-green-600 flex-shrink-0" />
                <span className="text-gray-700">No commitment required</span>
              </div>
            </div>

            <div className="bg-green-50 rounded-2xl p-4 mb-6">
              <div className="text-center">
                <div className="text-sm text-green-700 mb-1">Individual prices</div>
                <div className="text-3xl font-bold text-green-600">LKR 100+</div>
                <div className="text-sm text-green-700">per item</div>
              </div>
            </div>

            <div className="space-y-3">
              <Link
                to="/shop"
                className="w-full bg-green-600 text-white py-4 px-6 rounded-full font-semibold hover:bg-green-700 transition-colors flex items-center justify-center space-x-2 group"
              >
                <span>Start Shopping Now</span>
                <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>
          </div>

          {/* Subscription Leafy Bucket Option */}
          <div className="bg-white rounded-3xl p-8 shadow-lg relative group hover:shadow-xl transition-all duration-300">
            <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
              <div className="bg-orange-500 text-white px-4 py-2 rounded-full text-sm font-semibold flex items-center space-x-1 whitespace-nowrap">
                <Star className="h-4 w-4 fill-current" />
                <span>Most Popular</span>
              </div>
            </div>

            <div className="mb-6">
              <div className="bg-green-100 rounded-full p-4 inline-flex items-center justify-center mb-4">
                <Package className="h-8 w-8 text-green-600" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-3">Subscription Leafy Bucket</h3>
              <p className="text-gray-600 leading-relaxed">
                Perfect for busy families who want fresh vegetables delivered weekly without the hassle of choosing. We curate the best seasonal selection for you.
              </p>
            </div>

            <div className="space-y-3 mb-8">
              <div className="flex items-center space-x-3">
                <Check className="h-5 w-5 text-green-600 flex-shrink-0" />
                <span className="text-gray-700">Weekly delivery every Sunday</span>
              </div>
              <div className="flex items-center space-x-3">
                <Check className="h-5 w-5 text-green-600 flex-shrink-0" />
                <span className="text-gray-700">Curated seasonal selection</span>
              </div>
              <div className="flex items-center space-x-3">
                <Check className="h-5 w-5 text-green-600 flex-shrink-0" />
                <span className="text-gray-700">Recipe cards included</span>
              </div>
              <div className="flex items-center space-x-3">
                <Check className="h-5 w-5 text-green-600 flex-shrink-0" />
                <span className="text-gray-700">Better value per kg</span>
              </div>
              <div className="flex items-center space-x-3">
                <Check className="h-5 w-5 text-green-600 flex-shrink-0" />
                <span className="text-gray-700">Cancel anytime</span>
              </div>
            </div>

            <div className="bg-green-50 rounded-2xl p-4 mb-6">
              <div className="text-center">
                <div className="text-sm text-green-700 mb-1">Starting from</div>
                <div className="text-3xl font-bold text-green-600">LKR 2,900</div>
                <div className="text-sm text-green-700">per month</div>
              </div>
            </div>

            <div className="space-y-3">
              <a
                href="#pricing"
                className="w-full bg-green-600 text-white py-4 px-6 rounded-full font-semibold hover:bg-green-700 transition-colors flex items-center justify-center space-x-2 group"
              >
                <span>View Subscription Plans</span>
                <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </a>
            </div>
          </div>
        </div>



        {/* Comparison Section */}
        <div className="bg-white rounded-3xl p-8 shadow-lg">
          <h3 className="text-2xl font-bold text-gray-900 text-center mb-8">Quick Comparison</h3>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-gray-200">
                  <th className="text-left py-4 px-4 font-semibold text-gray-900">Feature</th>
                  <th className="text-center py-4 px-4 font-semibold text-green-600">Individual Shopping</th>
                  <th className="text-center py-4 px-4 font-semibold text-green-600">Subscription Leafy Bucket</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                <tr>
                  <td className="py-4 px-4 font-medium text-gray-900">Convenience</td>
                  <td className="py-4 px-4 text-center">
                    <div className="text-green-600 font-semibold">Medium</div>
                    <div className="text-sm text-gray-600">Order when needed</div>
                  </td>
                  <td className="py-4 px-4 text-center">
                    <div className="text-green-600 font-semibold">High</div>
                    <div className="text-sm text-gray-600">Auto-delivered weekly</div>
                  </td>
                </tr>
                <tr>
                  <td className="py-4 px-4 font-medium text-gray-900">Control</td>
                  <td className="py-4 px-4 text-center">
                    <div className="text-green-600 font-semibold">High</div>
                    <div className="text-sm text-gray-600">Choose everything</div>
                  </td>
                  <td className="py-4 px-4 text-center">
                    <div className="text-green-600 font-semibold">Medium</div>
                    <div className="text-sm text-gray-600">Curated selection</div>
                  </td>
                </tr>
                <tr>
                  <td className="py-4 px-4 font-medium text-gray-900">Value</td>
                  <td className="py-4 px-4 text-center">
                    <div className="text-green-600 font-semibold">Standard</div>
                    <div className="text-sm text-gray-600">Individual pricing</div>
                  </td>
                  <td className="py-4 px-4 text-center">
                    <div className="text-green-600 font-semibold">Better</div>
                    <div className="text-sm text-gray-600">Bulk pricing</div>
                  </td>
                </tr>
                <tr>
                  <td className="py-4 px-4 font-medium text-gray-900">Commitment</td>
                  <td className="py-4 px-4 text-center">
                    <div className="text-green-600 font-semibold">None</div>
                    <div className="text-sm text-gray-600">Order as needed</div>
                  </td>
                  <td className="py-4 px-4 text-center">
                    <div className="text-green-600 font-semibold">Monthly</div>
                    <div className="text-sm text-gray-600">Cancel anytime</div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Call to Action */}
        <div className="text-center mt-12">
          <p className="text-lg text-gray-600 mb-6">
            Still not sure which option is right for you?
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/products"
              className="bg-gray-100 text-gray-800 px-6 py-3 rounded-full font-semibold hover:bg-gray-200 transition-colors"
            >
              Learn More About Our Vegetables
            </Link>
            <a
              href="#testimonials"
              className="border-2 border-gray-300 text-gray-700 px-6 py-3 rounded-full font-semibold hover:border-gray-400 transition-colors"
            >
              Read Customer Reviews
            </a>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ShoppingOptions;