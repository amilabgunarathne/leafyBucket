import React from 'react';
import { MousePointer, Package, Truck, Smile, ArrowRight, ArrowDown } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const HowItWorks = () => {
  const { user } = useAuth();

  const handleGetStarted = () => {
    if (user) {
      // User is logged in, go to subscription page
      window.location.href = '/subscription';
    } else {
      // User not logged in, go to auth page
      window.location.href = '/auth';
    }
  };

  const steps = [
    {
      icon: MousePointer,
      title: "Choose Your Plan",
      description: "Select from our flexible monthly subscription plans designed for every household size."
    },
    {
      icon: Package,
      title: "We Pack Fresh",
      description: "Our team carefully selects and packs the freshest seasonal vegetables from local farms."
    },
    {
      icon: Truck,
      title: "Weekly Delivery",
      description: "Receive your fresh vegetable bucket every week at your doorstep, completely free delivery."
    },
    {
      icon: Smile,
      title: "Enjoy & Repeat",
      description: "Cook amazing meals with fresh ingredients and let us handle your weekly veggie shopping."
    }
  ];

  // Extract icon components for tablet layout
  const Step0Icon = steps[0].icon;
  const Step1Icon = steps[1].icon;
  const Step2Icon = steps[2].icon;
  const Step3Icon = steps[3].icon;

  return (
    <section id="how-it-works" className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center space-y-4 mb-16">
          <h2 className="text-4xl font-bold text-gray-900">How Subscription Works</h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Getting fresh vegetables delivered has never been easier. Follow these simple steps to start your healthy journey.
          </p>
        </div>

        {/* Desktop Layout - Horizontal Flow */}
        <div className="hidden lg:block">
          <div className="flex items-center justify-between">
            {steps.map((step, index) => (
              <React.Fragment key={index}>
                <div className="text-center group flex-1 max-w-xs">
                  <div className="relative mb-6">
                    <div className="bg-green-100 rounded-full p-6 inline-flex items-center justify-center group-hover:bg-green-200 transition-colors duration-300 mx-auto">
                      <step.icon className="h-8 w-8 text-green-600" />
                    </div>
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-3">{step.title}</h3>
                  <p className="text-gray-600 leading-relaxed">{step.description}</p>
                </div>

                {/* Arrow between steps (not after last step) */}
                {index < steps.length - 1 && (
                  <div className="flex-shrink-0 mx-4">
                    <ArrowRight className="h-8 w-8 text-green-400" />
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Tablet Layout - 2x2 Grid with Arrows */}
        <div className="hidden md:block lg:hidden">
          <div className="relative">
            {/* First Row */}
            <div className="grid grid-cols-2 gap-8 mb-8">
              <div className="text-center group">
                <div className="relative mb-6">
                  <div className="bg-green-100 rounded-full p-6 inline-flex items-center justify-center group-hover:bg-green-200 transition-colors duration-300">
                    <Step0Icon className="h-8 w-8 text-green-600" />
                  </div>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">{steps[0].title}</h3>
                <p className="text-gray-600 leading-relaxed">{steps[0].description}</p>
              </div>

              <div className="text-center group">
                <div className="relative mb-6">
                  <div className="bg-green-100 rounded-full p-6 inline-flex items-center justify-center group-hover:bg-green-200 transition-colors duration-300">
                    <Step1Icon className="h-8 w-8 text-green-600" />
                  </div>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">{steps[1].title}</h3>
                <p className="text-gray-600 leading-relaxed">{steps[1].description}</p>
              </div>
            </div>

            {/* Arrow pointing right between first row items */}
            <div className="absolute top-12 left-1/2 transform -translate-x-1/2">
              <ArrowRight className="h-6 w-6 text-green-400" />
            </div>

            {/* Vertical arrow connecting rows */}
            <div className="flex justify-center mb-8">
              <ArrowDown className="h-6 w-6 text-green-400" />
            </div>

            {/* Second Row */}
            <div className="grid grid-cols-2 gap-8">
              <div className="text-center group">
                <div className="relative mb-6">
                  <div className="bg-green-100 rounded-full p-6 inline-flex items-center justify-center group-hover:bg-green-200 transition-colors duration-300">
                    <Step2Icon className="h-8 w-8 text-green-600" />
                  </div>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">{steps[2].title}</h3>
                <p className="text-gray-600 leading-relaxed">{steps[2].description}</p>
              </div>

              <div className="text-center group">
                <div className="relative mb-6">
                  <div className="bg-green-100 rounded-full p-6 inline-flex items-center justify-center group-hover:bg-green-200 transition-colors duration-300">
                    <Step3Icon className="h-8 w-8 text-green-600" />
                  </div>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">{steps[3].title}</h3>
                <p className="text-gray-600 leading-relaxed">{steps[3].description}</p>
              </div>
            </div>

            {/* Arrow pointing right between second row items */}
            <div className="absolute bottom-12 left-1/2 transform -translate-x-1/2">
              <ArrowRight className="h-6 w-6 text-green-400" />
            </div>
          </div>
        </div>

        {/* Mobile Layout - Vertical Flow */}
        <div className="md:hidden space-y-8">
          {steps.map((step, index) => (
            <React.Fragment key={index}>
              <div className="text-center group">
                <div className="relative mb-6">
                  <div className="bg-green-100 rounded-full p-6 inline-flex items-center justify-center group-hover:bg-green-200 transition-colors duration-300">
                    <step.icon className="h-8 w-8 text-green-600" />
                  </div>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">{step.title}</h3>
                <p className="text-gray-600 leading-relaxed">{step.description}</p>
              </div>

              {/* Arrow between steps (not after last step) */}
              {index < steps.length - 1 && (
                <div className="flex justify-center">
                  <ArrowDown className="h-6 w-6 text-green-400" />
                </div>
              )}
            </React.Fragment>
          ))}
        </div>

        <div className="text-center mt-16">
          <button
            onClick={handleGetStarted}
            className="bg-green-600 text-white px-8 py-4 rounded-full text-lg font-semibold hover:bg-green-700 transform hover:scale-105 transition-all duration-200"
          >
            Get Started Today
          </button>
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;