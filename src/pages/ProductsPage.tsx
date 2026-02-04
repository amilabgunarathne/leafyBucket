import { ArrowLeft, Leaf, MapPin, Calendar } from 'lucide-react';
import { Link } from 'react-router-dom';


const ProductsPage = () => {
  // Get active vegetables from the admin-managed list


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
            <p className="text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed">
              Discover the fresh, organic vegetables we carefully select from local farms in Bandarawela and the surrounding hill country. Each week brings a curated selection of seasonal produce.
            </p>
          </div>

          <div className="grid lg:grid-cols-3 gap-8 mb-16">
            <div className="bg-white rounded-2xl p-6 shadow-lg text-center">
              <Leaf className="h-12 w-12 text-green-600 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-gray-900 mb-2">100% Organic</h3>
              <p className="text-gray-600">All vegetables grown without pesticides or chemicals</p>
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





      {/* Farm Information */}
      <section className="py-16 bg-green-600 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold mb-6">Fresh from Bandarawela Hill Country!</h2>
          <p className="text-green-100 text-lg mb-8 max-w-3xl mx-auto">
            Our vegetables are grown in the cool, fertile climate of Bandarawela, where traditional farming methods meet organic practices. The high altitude and rich soil create perfect conditions for nutrient-dense vegetables with authentic Sri Lankan flavors.
          </p>

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
              <div className="text-green-100">Organic Certified</div>
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
              to="/"
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