import React from 'react';
import Hero from '../components/Hero';
import HowItWorks from '../components/HowItWorks';
// TEMP: shop focus deferred — subscription first
// import ShoppingOptions from '../components/ShoppingOptions';
import Pricing from '../components/Pricing';
import Testimonials from '../components/Testimonials';

const HomePage = () => {
  return (
    <>
      <Hero />
      <HowItWorks />
      {/* TEMP: hide Choose Your Shopping Style + Quick Comparison (ShoppingOptions) */}
      {/* <ShoppingOptions /> */}

      <Pricing />
      <Testimonials />
    </>
  );
};

export default HomePage;