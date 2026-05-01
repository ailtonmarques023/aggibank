import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth.jsx';
import { useModal } from './hooks/useModal.jsx';
import DefaultLayout from './layouts/DefaultLayout';
import AuthLayout from './layouts/AuthLayout';
import TermsModal from './components/TermsModal';
import Home from './pages/Home';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Transactions from './pages/Transactions';
import Terms from './pages/Terms';
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

  return (
    <>
      {children}
      <TermsModal isOpen={isOpen} onClose={close} />
    </>
  );
};

// Componente para rotas protegidas
const PrivateRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="spinner h-12 w-12"></div>
      </div>
    );
  }

  return isAuthenticated ? children : <Navigate to="/login" replace />;
};

const App = () => {
  return (
    <Router>
      <AuthProvider>
        <TermsChecker>
          <Routes>
            {/* Rotas de Autenticação */}
            <Route path="/login" element={<AuthLayout><Login /></AuthLayout>} />
            <Route path="/forgot-password" element={<AuthLayout><div>Esqueceu a senha</div></AuthLayout>} />

            {/* Rotas Públicas */}
            <Route path="/" element={<DefaultLayout><Home /></DefaultLayout>} />
            <Route path="/terms" element={<DefaultLayout><Terms /></DefaultLayout>} />

            {/* Rotas Protegidas */}
            <Route path="/dashboard" element={<PrivateRoute><DefaultLayout><Dashboard /></DefaultLayout></PrivateRoute>} />
            <Route path="/transactions" element={<PrivateRoute><DefaultLayout><Transactions /></DefaultLayout></PrivateRoute>} />

            {/* Catch-all para rotas não encontradas */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </TermsChecker>
      </AuthProvider>
    </Router>
  );
};

export default App;


