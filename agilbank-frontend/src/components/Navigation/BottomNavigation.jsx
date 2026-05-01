import React from 'react';
import { 
  HomeIcon, 
  ArrowsUpDownIcon, 
  CurrencyDollarIcon, 
  ShoppingBagIcon,
  Squares2X2Icon 
} from '@heroicons/react/24/outline';
import { 
  HomeIcon as HomeIconSolid,
  ArrowsUpDownIcon as ArrowsUpDownIconSolid,
  CurrencyDollarIcon as CurrencyDollarIconSolid,
  ShoppingBagIcon as ShoppingBagIconSolid,
  Squares2X2Icon as Squares2X2IconSolid
} from '@heroicons/react/24/solid';

const BottomNavigation = ({ activeTab, onTabChange }) => {
  const tabs = [
    {
      id: 'home',
      name: 'Início',
      icon: HomeIcon,
      iconSolid: HomeIconSolid
    },
    {
      id: 'transactions',
      name: 'Transações',
      icon: ArrowsUpDownIcon,
      iconSolid: ArrowsUpDownIconSolid
    },
    {
      id: 'investments',
      name: 'Investir',
      icon: CurrencyDollarIcon,
      iconSolid: CurrencyDollarIconSolid
    },
    {
      id: 'marketplace',
      name: 'Shopping',
      icon: ShoppingBagIcon,
      iconSolid: ShoppingBagIconSolid
    },
    {
      id: 'more',
      name: 'Mais',
      icon: Squares2X2Icon,
      iconSolid: Squares2X2IconSolid
    }
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-2">
      <div className="flex justify-around items-center">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const IconComponent = isActive ? tab.iconSolid : tab.icon;
          
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex flex-col items-center space-y-1 py-2 px-3 rounded-xl transition-colors ${
                isActive ? 'bg-purple-50' : ''
              }`}
            >
              <IconComponent 
                className={`w-6 h-6 ${
                  isActive ? 'text-purple-600' : 'text-gray-400'
                }`} 
              />
              <span className={`text-xs font-medium ${
                isActive ? 'text-purple-600' : 'text-gray-400'
              }`}>
                {tab.name}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default BottomNavigation;
