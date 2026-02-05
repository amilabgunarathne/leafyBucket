import { Star, Quote } from 'lucide-react';

const Testimonials = () => {
  const testimonials = [
    {
      name: "Priya Perera",
      location: "Colombo, Sri Lanka",
      text: "The quality of vegetables from Leafy Bucket is incredible! My family has never eaten healthier, and the convenience of weekly delivery saves me so much time.",
      rating: 5,
      image: "https://images.pexels.com/photos/1102341/pexels-photo-1102341.jpeg?auto=compress&cs=tinysrgb&w=150"
    },
    {
      name: "Rohan Silva",
      location: "Kandy, Sri Lanka",
      text: "I love discovering traditional Sri Lankan vegetables I've never tried before. The recipe cards are helpful, and everything is always super fresh from Bandarawela.",
      rating: 5,
      image: "https://images.pexels.com/photos/1040880/pexels-photo-1040880.jpeg?auto=compress&cs=tinysrgb&w=150"
    },
    {
      name: "Amara Fernando",
      location: "Galle, Sri Lanka",
      text: "As a busy mom, Leafy Bucket has been a lifesaver. Fresh vegetables delivered right to our door every week. Highly recommend!",
      rating: 5,
      image: "https://images.pexels.com/photos/1239291/pexels-photo-1239291.jpeg?auto=compress&cs=tinysrgb&w=150"
    }
  ];

  return (
    <section id="testimonials" className="py-20 bg-gradient-to-br from-green-50 to-orange-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center space-y-4 mb-16">
          <h2 className="text-4xl font-bold text-gray-900">What Our Customers Say</h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Join thousands of happy families who have transformed their eating habits with our fresh vegetable delivery service.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 mb-12">
          {testimonials.map((testimonial, index) => (
            <div key={index} className="bg-white rounded-2xl p-8 shadow-lg relative">
              <Quote className="h-8 w-8 text-green-600 mb-4 opacity-50" />

              <div className="flex items-center mb-4">
                {[...Array(testimonial.rating)].map((_, i) => (
                  <Star key={i} className="h-5 w-5 text-yellow-400 fill-current" />
                ))}
              </div>

              <p className="text-gray-700 leading-relaxed mb-6 italic">
                "{testimonial.text}"
              </p>

              <div className="flex items-center space-x-4">
                <img
                  src={testimonial.image}
                  alt={testimonial.name}
                  className="w-12 h-12 rounded-full object-cover border-2 border-green-100"
                />
                <div>
                  <h4 className="font-semibold text-gray-900">{testimonial.name}</h4>
                  <p className="text-sm text-gray-600">{testimonial.location}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="text-center bg-white rounded-2xl p-8 shadow-lg">
          <div className="space-y-4">
            <div className="flex justify-center items-center space-x-2">
              <div className="flex items-center">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="h-6 w-6 text-yellow-400 fill-current" />
                ))}
              </div>
              <span className="text-2xl font-bold text-gray-900">4.9</span>
            </div>
            <p className="text-gray-600">
              Based on 2,000+ reviews from satisfied customers
            </p>
            <div className="flex justify-center items-center space-x-8 text-sm text-gray-500">
              <span>🏆 Best Vegetable Delivery 2025</span>
              <span>✅ 100% Satisfaction Guarantee</span>
              <span>🚚 Free Delivery Always</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Testimonials;