import React from 'react';
import Navbar from '../components/Navbar';
import CookieBanner from '../components/CookieBanner';

const DefaultLayout = ({ children }) => {
  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="pb-20">{children}</main>
      <CookieBanner />
    </div>
  );
};

export default DefaultLayout;
