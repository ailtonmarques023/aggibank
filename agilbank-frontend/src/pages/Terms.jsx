import React from 'react';

const Terms = () => {
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-2xl shadow-lg p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">Termos de Uso</h1>
          
          <div className="prose prose-lg max-w-none">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">1. Aceitação dos Termos</h2>
            <p className="text-gray-600 mb-6">
              Ao utilizar o AgilBank, você concorda com estes termos de uso. 
              Se não concordar com qualquer parte destes termos, não deve utilizar nossos serviços.
            </p>

            <h2 className="text-2xl font-semibold text-gray-900 mb-4">2. Serviços Oferecidos</h2>
            <p className="text-gray-600 mb-6">
              O AgilBank oferece serviços bancários digitais, incluindo:
            </p>
            <ul className="list-disc list-inside text-gray-600 mb-6 space-y-2">
              <li>Conta digital gratuita</li>
              <li>Transferências PIX</li>
              <li>Cartão de crédito e débito</li>
              <li>Investimentos</li>
              <li>Integração com serviços gov.br</li>
            </ul>

            <h2 className="text-2xl font-semibold text-gray-900 mb-4">3. Responsabilidades do Usuário</h2>
            <p className="text-gray-600 mb-6">
              Você é responsável por:
            </p>
            <ul className="list-disc list-inside text-gray-600 mb-6 space-y-2">
              <li>Manter a confidencialidade de suas credenciais</li>
              <li>Informar dados corretos e atualizados</li>
              <li>Utilizar os serviços de forma legal e ética</li>
              <li>Notificar imediatamente sobre uso não autorizado</li>
            </ul>

            <h2 className="text-2xl font-semibold text-gray-900 mb-4">4. Privacidade e Segurança</h2>
            <p className="text-gray-600 mb-6">
              Respeitamos sua privacidade e protegemos seus dados pessoais conforme 
              nossa Política de Privacidade e as leis aplicáveis.
            </p>

            <h2 className="text-2xl font-semibold text-gray-900 mb-4">5. Limitações de Responsabilidade</h2>
            <p className="text-gray-600 mb-6">
              O AgilBank não se responsabiliza por danos indiretos, lucros cessantes 
              ou outros prejuízos decorrentes do uso dos serviços.
            </p>

            <h2 className="text-2xl font-semibold text-gray-900 mb-4">6. Alterações nos Termos</h2>
            <p className="text-gray-600 mb-6">
              Reservamo-nos o direito de alterar estes termos a qualquer momento. 
              As alterações entrarão em vigor imediatamente após a publicação.
            </p>

            <h2 className="text-2xl font-semibold text-gray-900 mb-4">7. Contato</h2>
            <p className="text-gray-600 mb-6">
              Para dúvidas sobre estes termos, entre em contato conosco através 
              do suporte disponível no aplicativo.
            </p>
          </div>

          <div className="mt-8 pt-6 border-t border-gray-200">
            <p className="text-sm text-gray-500">
              Última atualização: 30 de setembro de 2024
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Terms;


