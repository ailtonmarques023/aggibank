import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';
import { authService } from '../services/authService';
import { storeAuthSession } from '../utils/authStorage';

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

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState(['', '', '', '', '', '']);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchParams] = useSearchParams();

  const handlePasswordChange = (index, value) => {
    const numericValue = value.replace(/\D/g, '').slice(0, 1);
    
    const newPassword = [...password];
    newPassword[index] = numericValue;
    setPassword(newPassword);
    
    if (numericValue && index < 5) {
      const nextInput = document.getElementById(`password-${index + 1}`);
      if (nextInput) nextInput.focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !password[index] && index > 0) {
      const prevInput = document.getElementById(`password-${index - 1}`);
      if (prevInput) prevInput.focus();
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const passwordString = password.join('');
    const identifier = email.trim();

    if (!isValidIdentifier(identifier)) {
      setError(LOGIN_ERROR_MESSAGES.VALIDATION_ERROR);
      setLoading(false);
      return;
    }

    if (passwordString.length !== 6) {
      setError('Informe sua senha de 6 dígitos.');
      setLoading(false);
      return;
    }

    try {
      const data = await authService.login(identifier, passwordString);

      if (data.success) {
        storeAuthSession(data.token, data.user);
        const nextRaw = (searchParams.get('next') || '').trim();
        const safeNext = nextRaw === '/verificacao-identidade' ? nextRaw : null;
        if (safeNext) {
          window.location.assign(safeNext);
          return;
        }
        window.location.replace('/banco/index.html');
      } else {
        setError(getLoginErrorMessage(data));
      }
    } catch (err) {
      setError(getLoginErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-blue-600 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white shadow-xl rounded-2xl overflow-hidden">
          {/* Barra de gradiente no topo */}
          <div className="h-1 bg-gradient-to-r from-green-400 to-blue-500"></div>
          
          <div className="px-8 py-8">
            {/* Logo AgilBank */}
            <div className="text-center mb-8">
              <div className="flex items-center justify-center mb-4">
                <span className="text-3xl font-bold text-blue-600">Agil</span>
                <span className="text-3xl font-bold text-green-600">Bank</span>
              </div>
              <p className="text-gray-600 text-sm">
                Acesse sua conta para continuar
              </p>
            </div>

            <form onSubmit={handleLogin} className="space-y-6">
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-red-700 text-sm">{error}</p>
                </div>
              )}

              {/* Campo E-mail ou CPF */}
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                  E-mail ou CPF
                </label>
                <input
                  type="text"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full px-3 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Digite seu e-mail ou CPF"
                  required
                />
              </div>

              {/* Campo Senha */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label htmlFor="senha" className="block text-sm font-medium text-gray-700">
                    Senha (6 dígitos)
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? (
                      <EyeSlashIcon className="h-5 w-5" />
                    ) : (
                      <EyeIcon className="h-5 w-5" />
                    )}
                  </button>
                </div>
                
                <div className="flex justify-center space-x-2 mb-2">
                  {[0, 1, 2, 3, 4, 5].map((index) => (
                    <input
                      key={index}
                      id={`password-${index}`}
                      type="text"
                      inputMode="numeric"
                      maxLength="1"
                      value={password[index] || ''}
                      onChange={(e) => handlePasswordChange(index, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(index, e)}
                      className="w-12 h-12 text-center text-lg font-semibold border-2 border-blue-200 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                      style={{
                        WebkitTextSecurity: showPassword ? 'none' : 'disc',
                        textSecurity: showPassword ? 'none' : 'disc'
                      }}
                    />
                  ))}
                </div>
                
                <p className="text-center text-blue-500 text-xs">
                  Clique aqui e digite sua senha de 6 dígitos
                </p>
              </div>

              {/* Opções */}
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <input
                    id="remember-me"
                    name="remember-me"
                    type="checkbox"
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-900">
                    Lembrar de mim
                  </label>
                </div>

                <div className="text-sm">
                  <a href="#" className="font-medium text-blue-600 hover:text-blue-500">
                    Esqueci minha senha
                  </a>
                </div>
              </div>

              {/* Botão Entrar */}
              <div>
                <button 
                  type="submit"
                  className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                  disabled={loading}
                >
                  {loading ? 'Entrando...' : 'Entrar'}
                </button>
              </div>
            </form>

            {/* Separador */}
            <div className="mt-6">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-300" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white text-gray-500">ou</span>
                </div>
              </div>
            </div>

            {/* Botões de login social */}
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                className="w-full inline-flex justify-center py-3 px-4 border border-gray-300 rounded-lg shadow-sm bg-white text-sm font-medium text-gray-500 hover:bg-gray-50"
              >
                <div className="flex items-center">
                  <div className="w-5 h-5 bg-red-500 rounded-full flex items-center justify-center mr-2">
                    <span className="text-white text-xs font-bold">G</span>
                  </div>
                  <span>Google</span>
                </div>
              </button>
              
              <button
                type="button"
                className="w-full inline-flex justify-center py-3 px-4 border border-gray-300 rounded-lg shadow-sm bg-white text-sm font-medium text-gray-500 hover:bg-gray-50"
              >
                <div className="flex items-center">
                  <div className="w-5 h-5 bg-blue-600 rounded flex items-center justify-center mr-2">
                    <span className="text-white text-xs font-bold">AB</span>
                  </div>
                  <span>AgilBank</span>
                </div>
              </button>
            </div>

            {/* Link para criar conta */}
            <div className="mt-6 text-center">
              <p className="text-sm text-gray-600">
                Não tem uma conta?
              </p>
              <Link to="/register" className="mt-2 block text-sm font-medium text-blue-600 hover:text-blue-500">
                Abrir Conta AgilBank
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
