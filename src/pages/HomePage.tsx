import React from 'react';
import Hero from '../components/Hero';
import HowItWorks from '../components/HowItWorks';
import ShoppingOptions from '../components/ShoppingOptions';
import Pricing from '../components/Pricing';
import Testimonials from '../components/Testimonials';

const HomePage = () => {
  return (
    <>
      <Hero />
      <HowItWorks />
      <ShoppingOptions />
      <Pricing />
      <Testimonials />
    </>
  );
};

export default HomePage;