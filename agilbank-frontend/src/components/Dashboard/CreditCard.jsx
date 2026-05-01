import React from 'react';
import { CreditCardIcon, ChevronRightIcon } from '@heroicons/react/24/outline';

const CreditCard = () => {
  return (
    <div className="px-6 py-4">
      <div className="bg-gradient-to-r from-purple-600 to-purple-800 rounded-2xl p-6 text-white">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <CreditCardIcon className="w-6 h-6" />
            <h3 className="text-lg font-semibold">Cartão de Crédito</h3>
          </div>
          <ChevronRightIcon className="w-5 h-5" />
        </div>
        
        <div className="space-y-3">
          <div>
            <p className="text-purple-200 text-sm">Fatura atual</p>
            <p className="text-2xl font-bold">R$ 1.234,56</p>
          </div>
          
          <div>
            <p className="text-purple-200 text-sm">Limite disponível</p>
            <p className="text-lg font-semibold">R$ 8.765,44</p>
          </div>
        </div>
        
        <div className="mt-4 pt-4 border-t border-purple-400/30">
          <div className="flex justify-between items-center">
            <span className="text-purple-200 text-sm">Vencimento: 15/10</span>
            <button className="bg-white/20 px-4 py-2 rounded-full text-sm font-medium hover:bg-white/30 transition-colors">
              Pagar fatura
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreditCard;


