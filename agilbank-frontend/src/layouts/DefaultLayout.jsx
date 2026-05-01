import React from 'react';
import { Outlet } from 'react-router-dom';
import Navbar from '../components/Navbar';
import CookieBanner from '../components/CookieBanner';

const DefaultLayout = () => {
  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="pb-20">
        <Outlet />
      </main>
      <CookieBanner />
    </div>
  );
};

export default DefaultLayout;
