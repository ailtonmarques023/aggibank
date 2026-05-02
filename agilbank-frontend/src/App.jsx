import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth.jsx';
import { useModal } from './hooks/useModal.jsx';
import DefaultLayout from './layouts/DefaultLayout';
import AuthLayout from './layouts/AuthLayout';
import TermsModal from './components/TermsModal';
import Home from './pages/Home';
import Login from './pages/Login';
import Transactions from './pages/Transactions';
import Terms from './pages/Terms';
import Register from './pages/Register/index.jsx';
import { hasAcceptedTerms } from './utils/helpers';

// Componente para verificar se o usuário aceitou os termos
const TermsChecker = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const { isOpen, open, close } = useModal();
  const [hasCheckedTerms, setHasCheckedTerms] = useState(false);

  useEffect(() => {
    if (isAuthenticated && !hasCheckedTerms) {
      const accepted = hasAcceptedTerms();
      if (!accepted) {
        open();
      }
      setHasCheckedTerms(true);
    }
  }, [isAuthenticated, hasCheckedTerms, open]);

  const handleAcceptTerms = (version) => {
    console.log('Termos aceitos:', version);
    close();
  };

  return (
    <>
      {children}
      <TermsModal
        isOpen={isOpen}
        onClose={close}
        onAccept={handleAcceptTerms}
      />
    </>
  );
};

// Componente para rotas protegidas
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-agilbank-primary"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <TermsChecker>{children}</TermsChecker>;
};

// Componente para rotas públicas (redirecionar se logado)
const PublicRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-agilbank-primary"></div>
      </div>
    );
  }

  return children;
};

// Componente principal da aplicação
const AppContent = () => {
  return (
    <Router>
      <Routes>
        {/* Rotas públicas */}
        <Route path="/" element={
          <DefaultLayout>
            <Home />
          </DefaultLayout>
        } />
        
        <Route path="/terms" element={
          <DefaultLayout>
            <Terms />
          </DefaultLayout>
        } />

        {/* Rotas de autenticação */}
        <Route path="/login" element={
          <PublicRoute>
            <AuthLayout>
              <Login />
            </AuthLayout>
          </PublicRoute>
        } />

        {/* Rotas protegidas */}
        <Route path="/transactions" element={
          <ProtectedRoute>
            <DefaultLayout>
              <Transactions />
            </DefaultLayout>
          </ProtectedRoute>
        } />

        <Route path="/account" element={
          <ProtectedRoute>
            <DefaultLayout>
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <h1 className="text-3xl font-bold text-gray-900 mb-8">
                  Configurações da Conta
                </h1>
                <div className="bg-white rounded-lg shadow p-8">
                  <p className="text-gray-600">
                    Página de configurações da conta em desenvolvimento...
                  </p>
                </div>
              </div>
            </DefaultLayout>
          </ProtectedRoute>
        } />

        {/* Rota de registro */}
        <Route path="/register" element={
          <PublicRoute>
            <Register />
          </PublicRoute>
        } />

        {/* Rota de recuperação de senha (placeholder) */}
        <Route path="/forgot-password" element={
          <PublicRoute>
            <AuthLayout>
              <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
                <div className="max-w-md w-full space-y-8">
                  <div className="text-center">
                    <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
                      <span className="text-agilbank-primary text-2xl font-bold">A</span>
                    </div>
                    <h2 className="text-3xl font-bold text-white mb-2">
                      Recuperar Senha
                    </h2>
                    <p className="text-blue-100">
                      Funcionalidade em desenvolvimento
                    </p>
                  </div>
                  <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
                    <p className="text-gray-600 mb-4">
                      A recuperação de senha será implementada em breve.
                    </p>
                    <a
                      href="/login"
                      className="text-agilbank-primary hover:text-blue-700 font-medium"
                    >
                      Voltar para o login
                    </a>
                  </div>
                </div>
              </div>
            </AuthLayout>
          </PublicRoute>
        } />

        {/* Rota 404 */}
        <Route path="*" element={
          <DefaultLayout>
            <div className="min-h-screen flex items-center justify-center">
              <div className="text-center">
                <h1 className="text-4xl font-bold text-gray-900 mb-4">404</h1>
                <p className="text-gray-600 mb-8">Página não encontrada</p>
                <a
                  href="/"
                  className="text-agilbank-primary hover:text-blue-700 font-medium"
                >
                  Voltar para o início
                </a>
              </div>
            </div>
          </DefaultLayout>
        } />
      </Routes>
    </Router>
  );
};

// Componente principal com providers
const App = () => {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
};

export default App;
