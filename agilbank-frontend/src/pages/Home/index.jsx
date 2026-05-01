import React from 'react';
import { Link } from 'react-router-dom';
import { 
  ShieldCheckIcon, 
  ClockIcon, 
  CurrencyDollarIcon,
  DevicePhoneMobileIcon,
  CheckCircleIcon,
  ArrowRightIcon
} from '@heroicons/react/24/outline';
import Button from '../../components/Button';
import { useAuth } from '../../hooks/useAuth.jsx';

const Home = () => {
  const { isAuthenticated } = useAuth();

  const features = [
    {
      icon: ShieldCheckIcon,
      title: 'Segurança Total',
      description: 'Seus dados protegidos com criptografia de ponta e autenticação de dois fatores.'
    },
    {
      icon: ClockIcon,
      title: 'Transações Instantâneas',
      description: 'PIX e transferências em tempo real, 24 horas por dia, 7 dias por semana.'
    },
    {
      icon: CurrencyDollarIcon,
      title: 'Sem Taxas Ocultas',
      description: 'Transparência total. Sem taxas de manutenção ou surpresas na sua conta.'
    },
    {
      icon: DevicePhoneMobileIcon,
      title: 'App Mobile',
      description: 'Gerencie sua conta de qualquer lugar com nosso aplicativo intuitivo.'
    }
  ];

  const benefits = [
    'Conta corrente digital gratuita',
    'PIX ilimitado sem taxas',
    'Cartão de débito sem anuidade',
    'Extrato detalhado em tempo real',
    'Suporte 24/7 via chat',
    'Investimentos com rendimento diário'
  ];

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-agilbank-primary to-blue-700 text-white py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-4xl md:text-6xl font-bold mb-6">
              Seu banco digital
              <span className="block text-blue-200">do futuro</span>
            </h1>
            <p className="text-xl md:text-2xl text-blue-100 mb-8 max-w-3xl mx-auto">
              Simplicidade, segurança e tecnologia avançada em uma única plataforma. 
              Gerencie seu dinheiro de forma inteligente.
            </p>
            
            {isAuthenticated ? (
              <Link to="/dashboard">
                <Button variant="secondary" size="lg" className="text-agilbank-primary">
                  Acessar Dashboard
                  <ArrowRightIcon className="ml-2 h-5 w-5" />
                </Button>
              </Link>
            ) : (
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link to="/register">
                  <Button variant="secondary" size="lg" className="text-agilbank-primary">
                    Criar Conta Grátis
                  </Button>
                </Link>
                <Link to="/login">
                  <Button variant="ghost" size="lg" className="text-white border-white hover:bg-white hover:text-agilbank-primary">
                    Já tenho conta
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Por que escolher o AgilBank?
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Oferecemos a melhor experiência bancária digital com tecnologia de ponta e atendimento humanizado.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map((feature, index) => (
              <div key={index} className="text-center p-6 rounded-lg hover:shadow-lg transition-shadow">
                <div className="w-16 h-16 bg-agilbank-primary bg-opacity-10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <feature.icon className="h-8 w-8 text-agilbank-primary" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  {feature.title}
                </h3>
                <p className="text-gray-600">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-6">
                Tudo que você precisa em um só lugar
              </h2>
              <p className="text-xl text-gray-600 mb-8">
                Com o AgilBank, você tem acesso a todos os serviços bancários essenciais 
                de forma simples, rápida e segura.
              </p>
              
              <div className="space-y-4">
                {benefits.map((benefit, index) => (
                  <div key={index} className="flex items-center">
                    <CheckCircleIcon className="h-6 w-6 text-agilbank-success mr-3 flex-shrink-0" />
                    <span className="text-gray-700">{benefit}</span>
                  </div>
                ))}
              </div>

              {!isAuthenticated && (
                <div className="mt-8">
                  <Link to="/register">
                    <Button variant="primary" size="lg">
                      Abrir minha conta agora
                    </Button>
                  </Link>
                </div>
              )}
            </div>

            <div className="relative">
              <div className="bg-white rounded-2xl shadow-xl p-8">
                <div className="text-center">
                  <div className="w-20 h-20 bg-agilbank-primary rounded-full flex items-center justify-center mx-auto mb-6">
                    <span className="text-white text-2xl font-bold">A</span>
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-2">
                    AgilBank Digital
                  </h3>
                  <p className="text-gray-600 mb-6">
                    Sua conta digital completa
                  </p>
                  
                  <div className="space-y-3 text-left">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Saldo disponível</span>
                      <span className="font-semibold">R$ 2.500,00</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">PIX disponível</span>
                      <span className="font-semibold text-agilbank-success">R$ 5.000,00</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Cartão de débito</span>
                      <span className="font-semibold text-agilbank-primary">Ativo</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-agilbank-primary text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Pronto para começar?
          </h2>
          <p className="text-xl text-blue-100 mb-8 max-w-2xl mx-auto">
            Junte-se a milhares de pessoas que já escolheram o AgilBank 
            para gerenciar suas finanças de forma inteligente.
          </p>
          
          {!isAuthenticated && (
            <Link to="/register">
              <Button variant="secondary" size="lg" className="text-agilbank-primary">
                Criar conta gratuita
              </Button>
            </Link>
          )}
        </div>
      </section>
    </div>
  );
};

export default Home;
