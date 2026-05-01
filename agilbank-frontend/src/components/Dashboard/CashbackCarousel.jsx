import React from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';

const CashbackCarousel = () => {
  const cashbacks = [
    {
      id: 'iplace',
      name: 'iPlace',
      logo: '🛍️',
      percentage: '10%',
      description: 'de cashback'
    },
    {
      id: 'magalu',
      name: 'Magazine Luiza',
      logo: '🏪',
      percentage: '10%',
      description: 'de cashback (Era 3%)'
    },
    {
      id: 'casas-bahia',
      name: 'Casas Bahia',
      logo: '🏠',
      percentage: '10%',
      description: 'de cashback'
    },
    {
      id: 'amazon',
      name: 'Amazon',
      logo: '📦',
      percentage: '10%',
      description: 'de cashback'
    }
  ];

  return (
    <div className="px-6 py-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Cashbacks em destaque</h2>
        <button className="text-purple-600 text-sm font-medium">Exibir todas</button>
      </div>
      
      <div className="flex space-x-4 overflow-x-auto pb-2">
        {cashbacks.map((cashback) => (
          <div key={cashback.id} className="flex-shrink-0 bg-white rounded-2xl p-4 border border-gray-100 min-w-[140px]">
            <div className="text-2xl mb-2">{cashback.logo}</div>
            <h3 className="font-semibold text-gray-900 text-sm mb-1">{cashback.name}</h3>
            <p className="text-purple-600 font-bold text-lg">{cashback.percentage}</p>
            <p className="text-gray-500 text-xs">{cashback.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CashbackCarousel;


