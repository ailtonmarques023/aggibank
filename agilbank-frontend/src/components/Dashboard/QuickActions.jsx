import React from 'react';
import { 
  CurrencyDollarIcon, 
  ArrowUpIcon, 
  ArrowDownIcon, 
  DevicePhoneMobileIcon,
  ChartBarIcon,
  CreditCardIcon,
  BanknotesIcon,
  QrCodeIcon
} from '@heroicons/react/24/outline';

const QuickActions = () => {
  const actions = [
    {
      id: 'pix',
      name: 'Pix',
      icon: <CurrencyDollarIcon className="w-6 h-6" />,
      color: 'bg-purple-100 text-purple-600',
      action: () => console.log('Pix clicked')
    },
    {
      id: 'pagar',
      name: 'Pagar',
      icon: <QrCodeIcon className="w-6 h-6" />,
      color: 'bg-green-100 text-green-600',
      action: () => console.log('Pagar clicked')
    },
    {
      id: 'transferir',
      name: 'Transferir',
      icon: <ArrowUpIcon className="w-6 h-6" />,
      color: 'bg-blue-100 text-blue-600',
      action: () => console.log('Transferir clicked')
    },
    {
      id: 'depositar',
      name: 'Depositar',
      icon: <ArrowDownIcon className="w-6 h-6" />,
      color: 'bg-orange-100 text-orange-600',
      action: () => console.log('Depositar clicked')
    },
    {
      id: 'recarga',
      name: 'Recarga',
      icon: <DevicePhoneMobileIcon className="w-6 h-6" />,
      color: 'bg-pink-100 text-pink-600',
      action: () => console.log('Recarga clicked')
    },
    {
      id: 'investir',
      name: 'Investir',
      icon: <ChartBarIcon className="w-6 h-6" />,
      color: 'bg-indigo-100 text-indigo-600',
      action: () => console.log('Investir clicked')
    },
    {
      id: 'cartoes',
      name: 'Cartões',
      icon: <CreditCardIcon className="w-6 h-6" />,
      color: 'bg-yellow-100 text-yellow-600',
      action: () => console.log('Cartões clicked')
    },
    {
      id: 'emprestimo',
      name: 'Empréstimo',
      icon: <BanknotesIcon className="w-6 h-6" />,
      color: 'bg-red-100 text-red-600',
      action: () => console.log('Empréstimo clicked')
    }
  ];

  return (
    <div className="px-6 py-4">
      <div className="grid grid-cols-4 gap-4">
        {actions.map((action) => (
          <button
            key={action.id}
            onClick={action.action}
            className="flex flex-col items-center space-y-2 p-4 rounded-2xl hover:bg-gray-50 transition-colors"
          >
            <div className={`w-12 h-12 rounded-full ${action.color} flex items-center justify-center`}>
              {action.icon}
            </div>
            <span className="text-xs font-medium text-gray-700">{action.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default QuickActions;


