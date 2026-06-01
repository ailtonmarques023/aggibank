import React, { useState, useEffect, createContext, useContext } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Home from './pages/Home';
import Login from './pages/Login';
import Terms from './pages/Terms';
import Register from './pages/Register/index.jsx';
import KycVerification from './pages/KycVerification/index.jsx';
import FaceVideoDevPage from './pages/KycVerification/FaceVideoDevPage.jsx';
import RevvoHomePreview from './pages/RevvoHomePreview/index.jsx';
import RevvoMissionsPreview from './pages/RevvoMissionsPreview/index.jsx';
import RevvoCreateMissionPreview from './pages/RevvoCreateMissionPreview/index.jsx';
import RevvoMissionExecutionPreview from './pages/RevvoMissionExecutionPreview/index.jsx';
import RevvoWalletPreview from './pages/RevvoWalletPreview/index.jsx';
import RevvoRankingPreview from './pages/RevvoRankingPreview/index.jsx';
import RevvoProfilePreview from './pages/RevvoProfilePreview/index.jsx';
import RevvoFeedPreview from './pages/RevvoFeedPreview/index.jsx';
import RevvoMinhasMissoesPreview from './pages/RevvoMinhasMissoesPreview/index.jsx';
import RevvoSaqueResgatePreview from './pages/RevvoSaqueResgatePreview/index.jsx';
import { AuthProvider as RegisterAuthProvider } from './hooks/useAuth.jsx';
import { authService } from './services/authService';
import { clearStoredAuth, getStoredAuth, storeAuthSession } from './utils/authStorage';

const LOGIN_ERROR_MESSAGES = {
  ACCOUNT_NOT_FOUND: 'Conta não encontrada. Abra sua conta AgilBank.',
  INVALID_PASSWORD: 'Senha incorreta. Confira os 6 dígitos.',
  VALIDATION_ERROR: 'Informe um e-mail válido ou CPF com 11 números.',
};

const isEmail = (identifier) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier);
const isCpf = (identifier) => /^\d{11}$/.test(identifier);
const isValidIdentifier = (identifier) => isEmail(identifier) || isCpf(identifier);

const getLoginErrorMessage = (error) => {
  const errorCode = error?.code || error?.error || error?.type;

  if (LOGIN_ERROR_MESSAGES[errorCode]) {
    return LOGIN_ERROR_MESSAGES[errorCode];
  }

  if (
    error?.request ||
    error?.code === 'ERR_NETWORK' ||
    error?.code === 'ECONNABORTED' ||
    error?.message === 'Network Error'
  ) {
    return 'Não foi possível conectar ao AgilBank agora.';
  }

  return error?.message || 'Não foi possível conectar ao AgilBank agora.';
};

// Context para autenticação
const AuthContext = createContext();

// Provider de autenticação
const AuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadStoredAuth = () => {
    try {
      const { token, userData } = getStoredAuth();
      
      if (token && userData && userData !== 'undefined' && userData !== 'null') {
        const parsedUser = JSON.parse(userData);
        if (parsedUser && typeof parsedUser === 'object') {
          setIsAuthenticated(true);
          setUser(parsedUser);
          return;
        }
      }

      setIsAuthenticated(false);
      setUser(null);
    } catch (error) {
      console.error('Erro ao carregar dados do usuário:', error);
      clearStoredAuth();
      setIsAuthenticated(false);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStoredAuth();
    window.addEventListener('agilbank-auth-changed', loadStoredAuth);

    return () => {
      window.removeEventListener('agilbank-auth-changed', loadStoredAuth);
    };
  }, []);

  const login = async (email, password) => {
    setLoading(true);
    const identifier = email.trim();

    if (!isValidIdentifier(identifier)) {
      setLoading(false);
      return { success: false, message: LOGIN_ERROR_MESSAGES.VALIDATION_ERROR };
    }

    if (password.length !== 6) {
      setLoading(false);
      return { success: false, message: 'Informe sua senha de 6 dígitos.' };
    }

    try {
      const data = await authService.login(identifier, password);

      if (data.success) {
        storeAuthSession(data.token, data.user);
        setIsAuthenticated(true);
        setUser(data.user);
        setLoading(false);
        return { success: true };
      } else {
        setLoading(false);
        return { success: false, message: getLoginErrorMessage(data) };
      }
    } catch (error) {
      setLoading(false);
      return { success: false, message: getLoginErrorMessage(error) };
    }
  };

  const logout = () => {
    clearStoredAuth();
    setIsAuthenticated(false);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

// Hook para usar o contexto
const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de AuthProvider');
  }
  return context;
};

// Componente para rotas protegidas
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return isAuthenticated ? children : <Navigate to="/login" replace />;
};

// Componente para rotas públicas (redirecionar se logado)
const PublicRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (isAuthenticated) {
    window.location.replace('/banco/index.html');
    return null;
  }

  return children;
};

// Componente principal da aplicação
const App = () => {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          {/* Rotas públicas */}
          <Route path="/" element={
            <PublicRoute>
              <Home />
            </PublicRoute>
          } />
          
          <Route path="/terms" element={<Terms />} />

          {/* Rota de login */}
          <Route path="/login" element={
            <PublicRoute>
              <Login />
            </PublicRoute>
          } />

          {/* Rota de cadastro */}
          <Route path="/register" element={
            <PublicRoute>
              <RegisterAuthProvider>
                <Register />
              </RegisterAuthProvider>
            </PublicRoute>
          } />

          <Route path="/dev/revvo-home" element={<RevvoHomePreview />} />
          <Route path="/dev/revvo-feed" element={<RevvoFeedPreview />} />
          <Route path="/dev/revvo-missions" element={<RevvoMissionsPreview />} />
          <Route path="/dev/revvo-minhas-missoes" element={<RevvoMinhasMissoesPreview />} />
          <Route path="/dev/revvo-saque" element={<RevvoSaqueResgatePreview />} />
          <Route path="/dev/revvo-resgate" element={<RevvoSaqueResgatePreview />} />
          <Route path="/dev/revvo-carteira" element={<RevvoWalletPreview />} />
          <Route path="/dev/revvo-ganhos" element={<RevvoWalletPreview />} />
          <Route path="/dev/revvo-ranking" element={<RevvoRankingPreview />} />
          <Route path="/dev/revvo-profile" element={<RevvoProfilePreview />} />
          <Route path="/dev/revvo-criar-missao" element={<RevvoCreateMissionPreview />} />
          <Route path="/dev/revvo-mission" element={<RevvoMissionExecutionPreview />} />
          <Route path="/dev/revvo-mission/:id" element={<RevvoMissionExecutionPreview />} />

          {import.meta.env.DEV ? (
            <Route path="/dev/face-video" element={<FaceVideoDevPage />} />
          ) : null}

          {/* KYC — usado pelo /banco (gate cartão/empréstimo) e links diretos */}
          <Route
            path="/verificacao-identidade"
            element={
              <ProtectedRoute>
                <KycVerification />
              </ProtectedRoute>
            }
          />

          {/* Rota 404 */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
};

export default App;
