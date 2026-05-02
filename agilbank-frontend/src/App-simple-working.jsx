import React, { useState, useEffect, createContext, useContext } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import {
  ArrowDownTrayIcon,
  ArrowLeftOnRectangleIcon,
  ArrowsRightLeftIcon,
  BanknotesIcon,
  Bars3Icon,
  BellIcon,
  CreditCardIcon,
  DocumentTextIcon,
  EyeSlashIcon,
  MagnifyingGlassIcon,
  QrCodeIcon,
  ShareIcon,
  UserCircleIcon,
} from '@heroicons/react/24/outline';
import Home from './pages/Home';
import Login from './pages/Login';
import Terms from './pages/Terms';
import Register from './pages/Register/index.jsx';
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

  return isAuthenticated ? <Navigate to="/conta" replace /> : children;
};

const AccountHome = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const displayName = user?.nomeCompleto || user?.nome || user?.name || 'Usuário';
  const email = user?.email || 'email@exemplo.com';
  const accountNumber = user?.numeroConta || user?.conta || '000.000.000-00';

  const quickActions = [
    { label: 'Pix', icon: QrCodeIcon },
    { label: 'Receba com Pix', icon: BanknotesIcon },
    { label: 'Pague suas contas', icon: Bars3Icon },
    { label: 'Extrato', icon: DocumentTextIcon },
    { label: 'Pague na maquininha', icon: CreditCardIcon },
    { label: 'Saque sem cartão', icon: BanknotesIcon },
  ];

  const services = [
    { label: 'Cobranças', icon: DocumentTextIcon },
    { label: 'Consignado e FGTS', icon: BanknotesIcon },
    { label: 'Transferências', icon: ArrowsRightLeftIcon },
    { label: 'Indique e Ganhe', icon: ShareIcon },
    { label: 'Cartão', icon: CreditCardIcon },
    { label: 'Crédito Pessoal', icon: BanknotesIcon },
  ];

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-[#eef1f5] text-slate-900">
      <header className="bg-[#086fb6] text-white">
        <div className="mx-auto max-w-md px-4 pt-2 pb-5">
          <div className="flex items-center justify-between">
            <div className="text-2xl font-bold tracking-tight">gov.br</div>
            <div className="flex items-center gap-3">
              <BellIcon className="h-5 w-5" />
              <MagnifyingGlassIcon className="h-5 w-5" />
              <button
                type="button"
                onClick={handleLogout}
                className="flex items-center gap-1 rounded-lg bg-blue-600 px-2 py-1 text-xs font-semibold hover:bg-blue-500"
              >
                <ArrowLeftOnRectangleIcon className="h-4 w-4" />
                Sair
              </button>
            </div>
          </div>

          <div className="mt-5 flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 text-slate-600">
                <UserCircleIcon className="h-8 w-8" />
              </div>
              <div>
                <h1 className="text-sm font-bold leading-tight">{displayName}</h1>
                <p className="mt-1 text-[11px] font-semibold leading-tight">{email}</p>
                <p className="text-[11px] font-semibold leading-tight">Conta: {accountNumber}</p>
              </div>
            </div>
            <button type="button" className="rounded-full bg-blue-500 p-2 hover:bg-blue-400">
              <ShareIcon className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-6 flex items-center gap-2">
            <div className="flex-1 rounded bg-blue-500 px-3 py-2 text-sm font-semibold">R$ 0,00</div>
            <EyeSlashIcon className="h-6 w-6" />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-md px-1 pb-8">
        <section className="bg-white px-3 py-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold text-blue-700">Limite Cartão Disponível</span>
            <span className="font-semibold">R$ 4.300,00</span>
          </div>
          <div className="mt-4 h-1.5 rounded-full bg-slate-200">
            <div className="h-1.5 w-0 rounded-full bg-blue-600" />
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-600">
            <span>Usado: R$ 0,00</span>
            <span>R$ 4.300,00</span>
          </div>
        </section>

        <section className="px-1 py-3">
          <label className="flex items-center gap-2 rounded-full bg-white px-3 py-2 text-sm text-slate-500 shadow">
            <MagnifyingGlassIcon className="h-5 w-5 text-slate-400" />
            <input
              type="search"
              placeholder="Buscar conversa"
              className="w-full bg-transparent outline-none"
            />
          </label>
        </section>

        <section className="px-1">
          <h2 className="mb-1 px-1 text-sm font-bold">Movimente sua conta</h2>
          <div className="rounded-lg bg-white p-3 shadow">
            <div className="grid grid-cols-3 gap-4">
              {quickActions.map(({ label, icon: Icon }) => (
                <button key={label} type="button" className="flex flex-col items-center gap-2 text-center text-[10px] text-slate-700">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                    <Icon className="h-5 w-5" />
                  </span>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="px-1 py-8">
          <div className="relative h-44 overflow-hidden rounded-lg bg-slate-200">
            <img
              src="/banco/img/mulher cartao.jpg"
              alt="Cliente usando cartão"
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-black/55" />
            <div className="absolute right-4 top-4 max-w-[145px] text-right font-extrabold uppercase leading-tight text-white drop-shadow">
              <p className="text-2xl text-slate-700">Seu cartão</p>
              <p className="mt-1 text-base">Aproveite agora e pague só depois</p>
            </div>
          </div>
        </section>

        <section className="px-1">
          <h2 className="mb-2 px-1 text-base font-bold">Serviços e Produtos</h2>
          <div className="grid grid-cols-3 gap-2 rounded bg-white p-3">
            {services.map(({ label, icon: Icon }) => (
              <button key={label} type="button" className="flex min-h-[68px] flex-col items-center justify-center gap-1 rounded border border-slate-200 text-center text-[10px] font-semibold text-slate-700">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-blue-700">
                  <Icon className="h-4 w-4" />
                </span>
                {label}
              </button>
            ))}
          </div>
        </section>

        <section className="px-1 pt-5">
          <div className="flex items-center gap-3 rounded-lg bg-[#0069b4] p-3 text-white">
            <CreditCardIcon className="h-10 w-10 shrink-0" />
            <div>
              <h2 className="text-sm font-bold">Tudo em um só cartão</h2>
              <p className="mt-1 text-[11px]">Faça compras, pagamentos e muito mais.</p>
            </div>
            <ArrowDownTrayIcon className="ml-auto h-5 w-5" />
          </div>
        </section>
      </main>
    </div>
  );
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

          <Route path="/conta" element={
            <ProtectedRoute>
              <AccountHome />
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
