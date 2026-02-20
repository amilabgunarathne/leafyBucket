import React, { useState } from 'react';
import { ArrowLeft, Leaf, MapPin, Calendar, Package, TreePine, Flower, ChevronDown, Mail, Phone } from 'lucide-react';
import { Link } from 'react-router-dom';
import { calculatePlanAllocation, defaultPlanVegetables, Vegetable } from '../data/vegetables';
import VegetableService from '../services/vegetableService';

const ProductsPage = () => {
  const [activeVegetables, setActiveVegetables] = React.useState<Vegetable[]>([]);
  const [faqOpen, setFaqOpen] = useState<number | null>(null);
  const vegetableService = VegetableService.getInstance();

  React.useEffect(() => {
    const init = async () => {
      await vegetableService.initialize();
      setActiveVegetables(vegetableService.getActiveVegetablesForBulk());
    };
    init();
  }, []);

  type PlanId = 'small' | 'medium' | 'large';

  const plans: {
    name: string;
    vegetableBudget: string;
    planId: PlanId;
  }[] = [
      { name: "Small Family", vegetableBudget: "2,200", planId: 'small' },
      { name: "Medium Family", vegetableBudget: "4,000", planId: 'medium' },
      { name: "Large Family", vegetableBudget: "5,700", planId: 'large' }
    ];

  const faqs: { q: string; a: string }[] = [
    { q: "How does the subscription work?", a: "Choose your bucket size (Small, Medium, or Large), then each week you get a fresh selection of vegetables. You can customize your bucket during the week—swap items you don’t want and add others from our catalog. We deliver on a set day so you always know when to expect your box." },
    { q: "Can I pause or cancel anytime?", a: "Yes. You can pause your subscription for a week or more, or cancel when you like. No long-term commitment—just fresh veggies when you want them." },
    { q: "Where do the vegetables come from?", a: "We source from local farms in Bandarawela and the surrounding hill country. The cool climate and rich soil there produce nutrient-dense, seasonal vegetables with authentic Sri Lankan flavours." },
    { q: "What if I’m not home for delivery?", a: "We’ll leave your bucket in a safe spot you specify, or you can arrange a neighbour to receive it. Contact us before your delivery day if you need to change anything." },
    { q: "How is the weight split between vegetables?", a: "Each bucket has a mix of root, leafy, and bushy vegetables. We use a fair allocation so you get a balanced variety—e.g. more roots and leafy greens, and a good share of bushy veggies—so every box feels well rounded." }
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
      {/* Hero */}
      <section className="bg-gradient-to-br from-green-50 via-white to-orange-50 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Link
            to="/"
            className="inline-flex items-center space-x-2 text-green-600 hover:text-green-700 transition-colors mb-6"
          >
            <ArrowLeft className="h-5 w-5" />
            <span>Back to Home</span>
          </Link>
          <div className="text-center max-w-3xl mx-auto">
            <h1 className="text-4xl lg:text-5xl font-bold text-gray-900 leading-tight mb-4">
              Discover <span className="text-green-600">Leafy Bucket</span>
            </h1>
            <p className="text-lg text-gray-600">
              See what’s in a typical bucket, how subscriptions work, and get to know us. Fresh, local vegetables delivered on your schedule.
            </p>
          </div>
        </div>
      </section>

      {/* Typical bucket examples */}
      <section id="bucket-examples" className="py-16 bg-white border-y border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-gray-900 text-center mb-4">What’s in a bucket?</h2>
          <p className="text-center text-gray-600 mb-10 max-w-2xl mx-auto">
            Here’s a typical mix for each plan. Exact items and weights vary by season and your customisations.
          </p>
          <div className="grid lg:grid-cols-3 gap-8">
            {plans.map((plan) => {
              const planVegetables = defaultPlanVegetables[plan.planId];
              const allocation = calculatePlanAllocation(
                parseInt(plan.vegetableBudget.replace(',', '')),
                planVegetables,
                activeVegetables
              );
              return (
                <div key={plan.planId} className="bg-gray-50 rounded-2xl p-6 border border-gray-100">
                  <h3 className="text-xl font-bold text-green-600 mb-4">{plan.name}</h3>
                  <div className="space-y-2">
                    {allocation.map(veg => {
                      const Icon = getCategoryIcon(veg.category);
                      return (
                        <div key={veg.id} className="flex items-center justify-between p-2 bg-white rounded-lg border border-gray-100">
                          <div className="flex items-center gap-2">
                            <div className={`p-1.5 rounded-md ${getCategoryColor(veg.category)}`}>
                              <Icon className="h-3.5 w-3.5" />
                            </div>
                            <span className="text-sm font-medium text-gray-800">{veg.name}</span>
                          </div>
                          <div className="text-right text-xs">
                            <span className="font-semibold text-gray-900">LKR {veg.allocatedBudget}</span>
                            <span className="text-gray-500 block">{veg.typicalWeight}</span>
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
      </section>

      {/* Subscriptions intro */}
      <section id="subscriptions" className="py-16 bg-green-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-gray-900 text-center mb-4">Why subscribe?</h2>
          <p className="text-center text-gray-600 mb-10 max-w-2xl mx-auto">
            Fixed monthly price, weekly fresh boxes, and the freedom to customise each bucket. No surprise bills—just predictable, seasonal produce.
          </p>
          <div className="grid md:grid-cols-3 gap-6 mb-10">
            <div className="bg-white rounded-xl p-6 shadow-sm text-center">
              <Calendar className="h-10 w-10 text-green-600 mx-auto mb-3" />
              <h3 className="font-semibold text-gray-900 mb-2">Weekly delivery</h3>
              <p className="text-sm text-gray-600">Same day each week. Customise your selection before we lock the bucket.</p>
            </div>
            <div className="bg-white rounded-xl p-6 shadow-sm text-center">
              <Leaf className="h-10 w-10 text-green-600 mx-auto mb-3" />
              <h3 className="font-semibold text-gray-900 mb-2">You’re in control</h3>
              <p className="text-sm text-gray-600">Swap out items you don’t want and add others from our seasonal list.</p>
            </div>
            <div className="bg-white rounded-xl p-6 shadow-sm text-center">
              <MapPin className="h-10 w-10 text-green-600 mx-auto mb-3" />
              <h3 className="font-semibold text-gray-900 mb-2">Local & fresh</h3>
              <p className="text-sm text-gray-600">Sourced from Bandarawela hill country farms, delivered to your door.</p>
            </div>
          </div>
          <div className="text-center">
            <Link
              to="/#pricing"
              className="inline-block bg-green-600 text-white px-8 py-3 rounded-full font-semibold hover:bg-green-700 transition-colors"
            >
              View plans & pricing
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-16 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-gray-900 text-center mb-10">Frequently asked questions</h2>
          <div className="space-y-2">
            {faqs.map((faq, i) => (
              <div
                key={i}
                className="border border-gray-200 rounded-xl overflow-hidden"
              >
                <button
                  onClick={() => setFaqOpen(faqOpen === i ? null : i)}
                  className="w-full flex items-center justify-between p-4 text-left bg-gray-50 hover:bg-gray-100 transition-colors"
                >
                  <span className="font-medium text-gray-900 pr-4">{faq.q}</span>
                  <ChevronDown className={`h-5 w-5 text-gray-500 flex-shrink-0 transition-transform ${faqOpen === i ? 'rotate-180' : ''}`} />
                </button>
                {faqOpen === i && (
                  <div className="p-4 pt-0 text-gray-600 text-sm border-t border-gray-100">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* About us & Contact */}
      <section id="about-contact" className="py-16 bg-gray-50 border-t border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-12">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-4">About us</h2>
              <p className="text-gray-600 mb-4">
                Leafy Bucket brings fresh, seasonal vegetables from Bandarawela and the hill country straight to your table. We work with local farmers who grow using traditional, sustainable methods—so you get nutrient-dense produce with real flavour, without the guesswork of shopping each week.
              </p>
              <p className="text-gray-600">
                We believe in fair allocation and transparency: you choose your bucket size, customise what’s inside, and pay one clear price. No hidden fees—just fresh veggies, delivered.
              </p>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Get in touch</h2>
              <p className="text-gray-600 mb-6">
                Questions about your order, delivery, or our produce? We’re here to help.
              </p>
              <ul className="space-y-3">
                <li className="flex items-center gap-3 text-gray-700">
                  <Mail className="h-5 w-5 text-green-600 flex-shrink-0" />
                  <a href="mailto:hello@leafybucket.com" className="hover:text-green-600 transition-colors">hello@leafybucket.com</a>
                </li>
                <li className="flex items-center gap-3 text-gray-700">
                  <Phone className="h-5 w-5 text-green-600 flex-shrink-0" />
                  <span>Contact us for phone support</span>
                </li>
              </ul>
              <p className="text-sm text-gray-500 mt-6">
                Bandarawela, Sri Lanka · Fresh from the hill country
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default ProductsPage;
