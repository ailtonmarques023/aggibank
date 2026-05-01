import React from 'react';
import { LockClosedIcon, ChartBarIcon, GlobeAltIcon } from '@heroicons/react/24/outline';

const Investments = () => {
  const investments = [
    {
      id: 'caixinhas',
      name: 'Caixinhas',
      icon: <LockClosedIcon className="w-5 h-5" />,
      amount: 'R$ 100,00',
      color: 'bg-blue-100 text-blue-600'
    },
    {
      id: 'investimentos',
      name: 'Investimentos',
      icon: <ChartBarIcon className="w-5 h-5" />,
      amount: 'R$ 317,94',
      color: 'bg-green-100 text-green-600'
    },
    {
      id: 'cripto',
      name: 'Cripto',
      icon: <GlobeAltIcon className="w-5 h-5" />,
      amount: 'R$ 758,90',
      color: 'bg-orange-100 text-orange-600'
    }
  ];

  return (
    <div className="px-6 py-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Acompanhe seu dinheiro</h2>
        <button className="text-purple-600 text-sm font-medium">Ver todos</button>
      </div>
      
      <div className="grid grid-cols-3 gap-4">
        {investments.map((investment) => (
          <div key={investment.id} className="bg-white rounded-2xl p-4 border border-gray-100">
            <div className={`w-10 h-10 rounded-full ${investment.color} flex items-center justify-center mb-3`}>
              {investment.icon}
            </div>
            <h3 className="font-semibold text-gray-900 text-sm">{investment.name}</h3>
            <p className="text-lg font-bold text-gray-900 mt-1">{investment.amount}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Investments;


