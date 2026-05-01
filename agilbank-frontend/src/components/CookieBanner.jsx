import React, { useState, useEffect } from 'react';
import { XMarkIcon, InformationCircleIcon } from '@heroicons/react/24/outline';
import Button from './Button';

const CookieBanner = () => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Verificar se o usuário já aceitou os cookies
    const cookiesAccepted = localStorage.getItem('agilbank_cookies_accepted');
    if (!cookiesAccepted) {
      setIsVisible(true);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem('agilbank_cookies_accepted', 'true');
    setIsVisible(false);
  };

  const handleReject = () => {
    localStorage.setItem('agilbank_cookies_accepted', 'false');
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 shadow-lg">
      <div className="max-w-7xl mx-auto p-4">
        <div className="flex items-start gap-4">
          <InformationCircleIcon className="h-6 w-6 text-agilbank-primary flex-shrink-0 mt-0.5" />
          
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-gray-900 mb-1">
              Uso de Cookies
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              Utilizamos cookies para melhorar sua experiência, personalizar conteúdo e analisar nosso tráfego. 
              Ao continuar navegando, você concorda com nossa política de cookies.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                variant="primary"
                size="sm"
                onClick={handleAccept}
                className="w-full sm:w-auto"
              >
                Aceitar todos
              </Button>
              
              <Button
                variant="secondary"
                size="sm"
                onClick={handleReject}
                className="w-full sm:w-auto"
              >
                Rejeitar
              </Button>
              
              <button
                onClick={() => window.open('/terms', '_blank')}
                className="text-sm text-agilbank-primary hover:text-blue-700 underline w-full sm:w-auto text-left sm:text-center"
              >
                Saiba mais
              </button>
            </div>
          </div>
          
          <button
            onClick={handleReject}
            className="text-gray-400 hover:text-gray-600 flex-shrink-0"
            aria-label="Fechar banner de cookies"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default CookieBanner;
