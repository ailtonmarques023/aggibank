import React, { useState, useEffect } from 'react';
import { ShieldCheckIcon, DocumentTextIcon } from '@heroicons/react/24/outline';
import { termsService } from '../../services/api';
import { formatDate } from '../../utils/helpers';
import Button from '../../components/Button';

const Terms = () => {
  const [terms, setTerms] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadTerms();
  }, []);

  const loadTerms = async () => {
    try {
      setLoading(true);
      setError(null);
      const termsData = await termsService.getTerms();
      setTerms(termsData);
    } catch (err) {
      setError('Erro ao carregar termos de uso');
      console.error('Erro ao carregar termos:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (terms) {
      const element = document.createElement('a');
      const file = new Blob([terms.html], { type: 'text/html' });
      element.href = URL.createObjectURL(file);
      element.download = `termos-de-uso-agilbank-v${terms.version}.html`;
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-agilbank-primary rounded-full flex items-center justify-center mx-auto mb-4">
          <ShieldCheckIcon className="h-8 w-8 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Termos de Uso
        </h1>
        <p className="text-gray-600">
          Conheça nossos termos e condições de uso
        </p>
      </div>

      {loading ? (
        <div className="bg-white rounded-lg shadow p-8">
          <div className="space-y-4">
            <div className="skeleton h-8 w-64" />
            <div className="skeleton h-4 w-full" />
            <div className="skeleton h-4 w-3/4" />
            <div className="skeleton h-32 w-full" />
            <div className="skeleton h-4 w-1/2" />
            <div className="skeleton h-24 w-full" />
          </div>
        </div>
      ) : error ? (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <div className="text-red-600 mb-4">
            <ShieldCheckIcon className="h-12 w-12 mx-auto mb-2" />
            <p className="text-lg font-medium">{error}</p>
          </div>
          <Button onClick={loadTerms} variant="primary">
            Tentar novamente
          </Button>
        </div>
      ) : terms ? (
        <div className="space-y-6">
          {/* Terms Info */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-blue-900 mb-1">
                  Versão {terms.version}
                </h2>
                <p className="text-blue-700">
                  Última atualização: {formatDate(terms.lastUpdated)}
                </p>
              </div>
              <Button
                variant="secondary"
                onClick={handleDownload}
                className="text-blue-700 border-blue-300 hover:bg-blue-100"
              >
                <DocumentTextIcon className="h-4 w-4 mr-2" />
                Baixar PDF
              </Button>
            </div>
          </div>

          {/* Terms Content */}
          <div className="bg-white rounded-lg shadow">
            <div className="p-8">
              <div 
                className="prose prose-lg max-w-none text-gray-700"
                dangerouslySetInnerHTML={{ __html: terms.html }}
              />
            </div>
          </div>

          {/* Contact Info */}
          <div className="bg-gray-50 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Dúvidas sobre os termos?
            </h3>
            <p className="text-gray-600 mb-4">
              Se você tiver alguma dúvida sobre estes termos de uso, entre em contato conosco:
            </p>
            <div className="space-y-2 text-sm text-gray-600">
              <p><strong>Email:</strong> suporte@agilbank.com</p>
              <p><strong>Telefone:</strong> (11) 3000-0000</p>
              <p><strong>Horário de atendimento:</strong> Segunda a sexta, das 8h às 18h</p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default Terms;
