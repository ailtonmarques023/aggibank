import React, { useState, useEffect, createContext, useContext } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Home from './pages/Home';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Terms from './pages/Terms';
import { authService } from './services/authService';

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

  useEffect(() => {
    try {
      const token = localStorage.getItem('agilbank_token');
      const userData = localStorage.getItem('agilbank_user');
      
      if (token && userData && userData !== 'undefined' && userData !== 'null') {
        const parsedUser = JSON.parse(userData);
        if (parsedUser && typeof parsedUser === 'object') {
          setIsAuthenticated(true);
          setUser(parsedUser);
        }
      }
    } catch (error) {
      console.error('Erro ao carregar dados do usuário:', error);
      localStorage.removeItem('agilbank_token');
      localStorage.removeItem('agilbank_user');
    } finally {
      setLoading(false);
    }
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
        localStorage.setItem('agilbank_token', data.token);
        localStorage.setItem('agilbank_user', JSON.stringify(data.user));
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
    localStorage.removeItem('agilbank_token');
    localStorage.removeItem('agilbank_user');
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

  return isAuthenticated ? <Navigate to="/dashboard" replace /> : children;
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

          {/* Rotas protegidas */}
          <Route path="/dashboard" element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          } />

          {/* Rota 404 */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
};

export default App;
