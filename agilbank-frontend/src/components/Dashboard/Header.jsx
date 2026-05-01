import React, { useState } from 'react';
import { EyeIcon, EyeSlashIcon, BellIcon, QuestionMarkCircleIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';

const Header = ({ user, onToggleBalance }) => {
  const [showBalance, setShowBalance] = useState(true);

  const handleToggleBalance = () => {
    setShowBalance(!showBalance);
    onToggleBalance && onToggleBalance(!showBalance);
  };

  return (
    <div className="bg-gradient-to-br from-purple-600 to-purple-800 text-white px-6 pt-12 pb-8">
      {/* Status Bar */}
      <div className="flex justify-between items-center mb-6">
        <div className="text-sm font-medium">09:43</div>
        <div className="flex items-center space-x-1">
          <div className="w-4 h-2 bg-white rounded-sm"></div>
          <div className="w-4 h-2 bg-white rounded-sm"></div>
          <div className="w-4 h-2 bg-white rounded-sm"></div>
          <div className="w-4 h-2 bg-white rounded-sm"></div>
          <div className="w-4 h-2 bg-white rounded-sm"></div>
        </div>
      </div>

      {/* Profile Section */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
            <span className="text-lg font-bold">
              {user?.nomeCompleto?.charAt(0) || 'A'}
            </span>
          </div>
          <div>
            <h1 className="text-xl font-bold">Olá, {user?.nomeCompleto?.split(' ')[0] || 'Ailton'}</h1>
            <p className="text-purple-200 text-sm">Cliente AgilBank</p>
          </div>
        </div>
        
        <div className="flex items-center space-x-4">
          <button className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <BellIcon className="w-6 h-6" />
          </button>
          <button 
            onClick={handleToggleBalance}
            className="p-2 hover:bg-white/10 rounded-full transition-colors"
          >
            {showBalance ? <EyeIcon className="w-6 h-6" /> : <EyeSlashIcon className="w-6 h-6" />}
          </button>
          <button className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <QuestionMarkCircleIcon className="w-6 h-6" />
          </button>
          <button className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <ShieldCheckIcon className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Account Balance */}
      <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold">Saldo em conta</h2>
          <button className="text-purple-200 text-sm flex items-center">
            Ver extrato
            <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
        <div className="text-3xl font-bold">
          {showBalance ? 'R$ 1.356,98' : '••••'}
        </div>
        <p className="text-purple-200 text-sm mt-1">
          {showBalance ? 'Saldo disponível' : '••••••••••••••••'}
        </p>
      </div>
    </div>
  );
};

export default Header;


