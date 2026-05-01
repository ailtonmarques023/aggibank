import React, { useState, useEffect } from 'react';
import Header from '../components/Dashboard/Header';
import QuickActions from '../components/Dashboard/QuickActions';
import CreditCard from '../components/Dashboard/CreditCard';
import Investments from '../components/Dashboard/Investments';
import CashbackCarousel from '../components/Dashboard/CashbackCarousel';
import DocumentsCard from '../components/GovBR/DocumentsCard';
import ServicesCard from '../components/GovBR/ServicesCard';
import BottomNavigation from '../components/Navigation/BottomNavigation';

const Dashboard = () => {
  const [activeTab, setActiveTab] = useState('home');
  const [user, setUser] = useState(null);
  const [showBalance, setShowBalance] = useState(true);

  useEffect(() => {
    // Carregar dados do usuário do localStorage
    const userData = localStorage.getItem('agilbank_user');
    if (userData) {
      setUser(JSON.parse(userData));
    }
  }, []);

  const handleToggleBalance = (isVisible) => {
    setShowBalance(isVisible);
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'home':
        return (
          <div className="pb-20">
            <Header user={user} onToggleBalance={handleToggleBalance} />
            <QuickActions />
            <CreditCard />
            <Investments />
            <CashbackCarousel />
            <DocumentsCard />
            <ServicesCard />
          </div>
        );
      
      case 'transactions':
        return (
          <div className="pt-16 pb-20 px-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-6">Transações</h1>
            <div className="bg-white rounded-2xl p-6 border border-gray-100">
              <p className="text-gray-500 text-center">Suas transações aparecerão aqui</p>
            </div>
          </div>
        );
      
      case 'investments':
        return (
          <div className="pt-16 pb-20 px-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-6">Investimentos</h1>
            <Investments />
          </div>
        );
      
      case 'marketplace':
        return (
          <div className="pt-16 pb-20 px-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-6">Shopping</h1>
            <CashbackCarousel />
          </div>
        );
      
      case 'more':
        return (
          <div className="pt-16 pb-20 px-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-6">Mais</h1>
            <DocumentsCard />
            <ServicesCard />
          </div>
        );
      
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {renderContent()}
      <BottomNavigation activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
};

export default Dashboard;


