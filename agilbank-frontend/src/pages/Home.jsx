import React from 'react';
import { Link } from 'react-router-dom';
import { BRAND_MEDIA } from '../constants/brandMedia';

const Home = () => {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <section className="bg-white py-8 sm:py-12 lg:py-16">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 text-center">
          <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 mb-4 sm:mb-6">
            Seu banco digital confiável
          </h1>
          <p className="text-base sm:text-lg lg:text-xl text-gray-600 mb-6 sm:mb-8 max-w-3xl mx-auto px-2">
            Conta digital gratuita, PIX instantâneo, investimentos seguros e integração completa com serviços do governo.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center px-4">
            <Link
              to="/login"
              className="bg-blue-600 text-white px-6 py-3 sm:px-8 sm:py-4 rounded-lg font-semibold text-base sm:text-lg hover:bg-blue-700 transition-colors"
            >
              Acessar minha conta
            </Link>
            <Link
              to="/register"
              className="border-2 border-blue-600 text-blue-600 px-6 py-3 sm:px-8 sm:py-4 rounded-lg font-semibold text-base sm:text-lg hover:bg-blue-50 transition-colors inline-block text-center"
            >
              Abrir conta gratuita
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-8 sm:py-12 lg:py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="text-center mb-8 sm:mb-12">
            <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 mb-3 sm:mb-4">
              Por que escolher o AgilBank?
            </h2>
            <p className="text-sm sm:text-base lg:text-lg text-gray-600 px-2">
              Soluções bancárias modernas e seguras para sua vida digital
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
            <div className="bg-white rounded-lg p-4 sm:p-6 lg:p-8 shadow-sm border">
              <div className="w-12 h-12 sm:w-14 sm:h-14 lg:w-16 lg:h-16 bg-blue-100 rounded-lg flex items-center justify-center mx-auto mb-4 sm:mb-6">
                <span className="text-lg sm:text-xl lg:text-2xl">💳</span>
              </div>
              <h3 className="text-lg sm:text-xl font-semibold text-gray-900 mb-3 sm:mb-4 text-center">Cartão sem anuidade</h3>
              <p className="text-sm sm:text-base text-gray-600 text-center">
                Cartão de crédito e débito sem taxas escondidas. 
                <span className="block mt-2 text-blue-600 font-semibold">100% gratuito para sempre.</span>
              </p>
            </div>
            
            <div className="bg-white rounded-lg p-4 sm:p-6 lg:p-8 shadow-sm border">
              <div className="w-12 h-12 sm:w-14 sm:h-14 lg:w-16 lg:h-16 bg-green-100 rounded-lg flex items-center justify-center mx-auto mb-4 sm:mb-6">
                <span className="text-lg sm:text-xl lg:text-2xl">⚡</span>
              </div>
              <h3 className="text-lg sm:text-xl font-semibold text-gray-900 mb-3 sm:mb-4 text-center">PIX instantâneo</h3>
              <p className="text-sm sm:text-base text-gray-600 text-center">
                Transfira dinheiro na velocidade da luz. 
                <span className="block mt-2 text-green-600 font-semibold">24h por dia, 7 dias por semana.</span>
              </p>
            </div>
            
            <div className="bg-white rounded-lg p-4 sm:p-6 lg:p-8 shadow-sm border">
              <div className="w-12 h-12 sm:w-14 sm:h-14 lg:w-16 lg:h-16 bg-blue-100 rounded-lg flex items-center justify-center mx-auto mb-4 sm:mb-6">
                <span className="text-lg sm:text-xl lg:text-2xl">🏛️</span>
              </div>
              <h3 className="text-lg sm:text-xl font-semibold text-gray-900 mb-3 sm:mb-4 text-center">Integração gov.br</h3>
              <p className="text-sm sm:text-base text-gray-600 text-center">
                Acesse serviços públicos e documentos digitais. 
                <span className="block mt-2 text-blue-600 font-semibold">Tudo em um só lugar.</span>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-blue-600 py-8 sm:py-12 lg:py-16">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 text-center">
          <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold text-white mb-4 sm:mb-6">
            Pronto para começar?
          </h2>
          <p className="text-sm sm:text-base lg:text-xl text-blue-100 mb-6 sm:mb-8 px-2">
            Junte-se a milhares de brasileiros que já escolheram o AgilBank
          </p>
          <Link
            to="/register"
            className="bg-white text-blue-600 px-6 py-3 sm:px-8 sm:py-4 rounded-lg font-semibold text-base sm:text-lg hover:bg-gray-50 transition-colors"
          >
            Abrir conta gratuita
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-8 sm:py-12">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="text-center">
            <div className="mb-4 sm:mb-6 flex items-center justify-center">
              <img
                src={BRAND_MEDIA.logoDarkBg}
                alt="AgilBank"
                className="h-9 w-auto max-h-10 max-w-[min(220px,70vw)] object-contain"
                width={200}
                height={40}
                decoding="async"
              />
            </div>
            <p className="text-gray-400 mb-4 sm:mb-6 text-sm sm:text-base">
              © 2024 AgilBank. Todos os direitos reservados.
            </p>
            <div className="flex flex-col sm:flex-row justify-center space-y-2 sm:space-y-0 sm:space-x-6 lg:space-x-8">
              <Link to="/terms" className="text-gray-400 hover:text-white transition-colors text-sm sm:text-base">
                Termos de Uso
              </Link>
              <a href="#" className="text-gray-400 hover:text-white transition-colors text-sm sm:text-base">
                Política de Privacidade
              </a>
              <a href="#" className="text-gray-400 hover:text-white transition-colors text-sm sm:text-base">
                Contato
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Home;


