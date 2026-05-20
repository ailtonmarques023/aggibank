import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { authService } from './services/authService';
import { storeAuthSession } from './utils/authStorage';

// Componente Home simples
const Home = () => {
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState(['', '', '', '', '', '']);
  const [showPassword, setShowPassword] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  const handlePasswordChange = (index, value) => {
    // Aceitar apenas números e limitar a 1 caractere
    const numericValue = value.replace(/\D/g, '').slice(0, 1);
    
    const newPassword = [...password];
    newPassword[index] = numericValue;
    setPassword(newPassword);
    
    // Auto-focus no próximo campo
    if (numericValue && index < 5) {
      const nextInput = document.getElementById(`password-${index + 1}`);
      if (nextInput) nextInput.focus();
    }
  };

  const handleKeyDown = (index, e) => {
    // Voltar para o campo anterior ao pressionar Backspace
    if (e.key === 'Backspace' && !password[index] && index > 0) {
      const prevInput = document.getElementById(`password-${index - 1}`);
      if (prevInput) prevInput.focus();
    }
  };

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Verificar se todos os campos estão preenchidos
    const passwordString = password.join('');
    if (!email || passwordString.length !== 6) {
      setError('Por favor, preencha todos os campos corretamente');
      setLoading(false);
      return;
    }

    try {
      const data = await authService.login(email, passwordString);

      if (data.success) {
        // Salvar token e dados do usuário
        storeAuthSession(data.token, data.user);
        
        window.location.href = '/';
      } else {
        setError(data.message || 'Email ou senha incorretos');
      }
    } catch (err) {
      setError(err.message || 'Erro ao conectar com o servidor. Verifique a configuração da API.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 flex items-center justify-center">
            <div className="bg-blue-600 text-white rounded-lg p-2">
              <span className="text-xl font-bold">AB</span>
            </div>
          </div>
          <h2 className="mt-6 text-center text-2xl font-bold tracking-tight text-gray-900">
            Bem-vindo ao AgilBank
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Seu banco digital confiável
          </p>
        </div>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <form onSubmit={handleLogin} className="space-y-6">
            <div className="text-center">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Acesse sua conta
              </h3>
              <p className="text-sm text-gray-600 mb-6">
                Entre com seu e-mail e senha para continuar
              </p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                E-mail ou CPF
              </label>
              <div className="mt-1">
                <input
                  type="text"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  className="input"
                  placeholder="Digite seu e-mail ou CPF"
                  required
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="senha" className="block text-sm font-medium text-gray-700">
                  Senha (6 dígitos)
                </label>
                <button
                  type="button"
                  onClick={togglePasswordVisibility}
                  className="text-gray-400 hover:text-gray-600 focus:outline-none focus:text-gray-600"
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                >
                  {showPassword ? (
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
              <div className="flex justify-center space-x-2 mt-1">
                {[0, 1, 2, 3, 4, 5].map((index) => (
                  <input
                    key={index}
                    id={`password-${index}`}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength="1"
                    value={password[index] || ''}
                    onChange={(e) => handlePasswordChange(index, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(index, e)}
                    className="w-12 h-12 text-center text-lg font-semibold border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 transition-colors"
                    style={{
                      WebkitTextSecurity: showPassword ? 'none' : 'disc',
                      textSecurity: showPassword ? 'none' : 'disc'
                    }}
                  />
                ))}
              </div>
              <p className="text-xs text-blue-600 mt-2 text-center">
                Clique aqui e digite sua senha de 6 dígitos
              </p>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <input
                  id="remember-me"
                  name="remember-me"
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
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

            <div>
              <button 
                type="submit"
                className="btn btn-primary w-full"
                disabled={loading}
              >
                {loading ? 'Entrando...' : 'Entrar'}
              </button>
            </div>
          </form>

          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="bg-white px-2 text-gray-500">ou</span>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <button className="btn btn-secondary">
                <svg className="h-5 w-5 mr-2" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                </svg>
                Google
              </button>

              <button className="btn btn-secondary">
                <svg className="h-5 w-5 mr-2" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                </svg>
                Gov.br
              </button>
            </div>
          </div>

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600">
              Não tem uma conta?{' '}
              <a href="/register" className="font-medium text-blue-600 hover:text-blue-500">
                Abrir Conta AgilBank
              </a>
            </p>
          </div>
        </div>
      </div>

      <div className="mt-8 text-center">
        <p className="text-xs text-gray-500">
          Ao continuar, você concorda com nossos{' '}
          <a href="#" className="text-blue-600 hover:text-blue-500 underline">
            Termos de Uso
          </a>{' '}
          e{' '}
          <a href="#" className="text-blue-600 hover:text-blue-500 underline">
            Política de Privacidade
          </a>
        </p>
      </div>
    </div>
  );
};

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Home />} />
        <Route path="*" element={<Home />} />
      </Routes>
    </Router>
  );
}

export default App;
