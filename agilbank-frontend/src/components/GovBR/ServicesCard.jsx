import React from 'react';
import { CalendarDaysIcon, BellIcon, DocumentArrowDownIcon } from '@heroicons/react/24/outline';

const ServicesCard = () => {
  const services = [
    {
      id: 'agendamentos',
      name: 'Agendamentos',
      icon: <CalendarDaysIcon className="w-5 h-5" />,
      description: 'INSS, órgãos públicos',
      count: 2
    },
    {
      id: 'notificacoes',
      name: 'Notificações',
      icon: <BellIcon className="w-5 h-5" />,
      description: 'Serviços integrados',
      count: 5
    },
    {
      id: 'comprovantes',
      name: 'Comprovantes',
      icon: <DocumentArrowDownIcon className="w-5 h-5" />,
      description: 'Documentos oficiais',
      count: 3
    }
  ];

  return (
    <div className="px-6 py-4">
      <div className="bg-white rounded-2xl p-6 border border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Serviços Gov.br</h2>
          <button className="text-purple-600 text-sm font-medium">Acessar gov.br</button>
        </div>
        
        <div className="space-y-3">
          {services.map((service) => (
            <div key={service.id} className="flex items-center justify-between p-3 rounded-xl bg-gray-50">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                  {service.icon}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{service.name}</h3>
                  <p className="text-gray-500 text-sm">{service.description}</p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                {service.count > 0 && (
                  <span className="bg-purple-100 text-purple-600 text-xs font-medium px-2 py-1 rounded-full">
                    {service.count}
                  </span>
                )}
                <button className="text-purple-600 text-sm font-medium">
                  Acessar
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ServicesCard;


