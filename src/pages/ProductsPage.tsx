import React from 'react';
import { ArrowLeft, Star, Leaf, MapPin, Calendar } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getActiveVegetables } from '../data/vegetables';

const ProductsPage = () => {
  // Get active vegetables from the admin-managed list
  const vegetables = getActiveVegetables();

  const seasonalHighlights = [
    {
      season: "Current Season",
      vegetables: ["Gotukola", "Mukunuwenna", "Carrots", "Sweet Potato"],
      description: "Peak freshness and flavor from our hill country farms"
    },
    {
      season: "Coming Soon",
      vegetables: ["Kankun", "Radish", "Leeks"],
      description: "Fresh varieties being prepared for next week's harvest"
    }
  ];

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

      {/* Seasonal Highlights */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-gray-900 text-center mb-12">This Week's Seasonal Highlights</h2>
          <div className="grid md:grid-cols-2 gap-8 mb-16">
            {seasonalHighlights.map((highlight, index) => (
              <div key={index} className="bg-gradient-to-br from-green-50 to-orange-50 rounded-2xl p-8">
                <h3 className="text-2xl font-bold text-gray-900 mb-4">{highlight.season}</h3>
                <p className="text-gray-600 mb-6">{highlight.description}</p>
                <div className="flex flex-wrap gap-2">
                  {highlight.vegetables.map((veg, vegIndex) => (
                    <span key={vegIndex} className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-medium">
                      {veg}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Vegetables Grid */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-gray-900 text-center mb-12">Our Complete Vegetable Selection</h2>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-12">
            {vegetables.map((vegetable, index) => (
              <div key={index} className="bg-white rounded-2xl overflow-hidden shadow-lg hover:shadow-xl transition-all duration-300 group">
                <div className="aspect-w-16 aspect-h-12 overflow-hidden">
                  <img
                    src={vegetable.image}
                    alt={vegetable.name}
                    className="w-full h-48 object-cover group-hover:scale-110 transition-transform duration-300"
                  />
                </div>
                <div className="p-6">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-lg font-semibold text-gray-900">{vegetable.name}</h3>
                    <div className="flex items-center">
                      {[...Array(5)].map((_, i) => (
                        <Star key={i} className="h-3 w-3 text-yellow-400 fill-current" />
                      ))}
                    </div>
                  </div>
                  
                  <p className="text-gray-600 text-sm leading-relaxed mb-4">{vegetable.description}</p>
                  
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">Season:</span>
                      <span className="font-medium text-green-600">{vegetable.season}</span>
                    </div>
                    
                    <div>
                      <span className="text-gray-500 text-sm block mb-2">Health Benefits:</span>
                      <div className="flex flex-wrap gap-1">
                        {vegetable.benefits.map((benefit, benefitIndex) => (
                          <span key={benefitIndex} className="bg-blue-50 text-blue-700 text-xs px-2 py-1 rounded-full">
                            {benefit}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
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