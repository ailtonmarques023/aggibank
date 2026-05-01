import React from 'react';
import { DocumentTextIcon, IdentificationIcon, AcademicCapIcon } from '@heroicons/react/24/outline';

const DocumentsCard = () => {
  const documents = [
    {
      id: 'cpf',
      name: 'CPF',
      icon: <IdentificationIcon className="w-5 h-5" />,
      status: 'Disponível',
      color: 'text-green-600'
    },
    {
      id: 'cnh',
      name: 'CNH Digital',
      icon: <DocumentTextIcon className="w-5 h-5" />,
      status: 'Disponível',
      color: 'text-green-600'
    },
    {
      id: 'ctps',
      name: 'Carteira de Trabalho',
      icon: <AcademicCapIcon className="w-5 h-5" />,
      status: 'Disponível',
      color: 'text-green-600'
    }
  ];

  return (
    <div className="px-6 py-4">
      <div className="bg-white rounded-2xl p-6 border border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Documentos Digitais</h2>
          <button className="text-purple-600 text-sm font-medium">Ver todos</button>
        </div>
        
        <div className="space-y-3">
          {documents.map((doc) => (
            <div key={doc.id} className="flex items-center justify-between p-3 rounded-xl bg-gray-50">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                  {doc.icon}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{doc.name}</h3>
                  <p className={`text-sm ${doc.color}`}>{doc.status}</p>
                </div>
              </div>
              <button className="text-purple-600 text-sm font-medium">
                Visualizar
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default DocumentsCard;


