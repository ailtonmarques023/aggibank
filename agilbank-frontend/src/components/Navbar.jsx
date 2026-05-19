import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  Bars3Icon, 
  XMarkIcon, 
  UserCircleIcon,
  ArrowRightOnRectangleIcon,
  Cog6ToothIcon,
  ShieldCheckIcon,
  IdentificationIcon,
} from '@heroicons/react/24/outline';
import { useAuth } from '../hooks/useAuth.jsx';
import Button from './Button';

const Navbar = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/');
    setIsUserMenuOpen(false);
  };

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  const toggleUserMenu = () => {
    setIsUserMenuOpen(!isUserMenuOpen);
  };

  return (
    <nav className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-agilbank-primary rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">A</span>
            </div>
            <span className="text-xl font-bold text-gray-900">AgilBank</span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-8">
            {isAuthenticated ? (
              <>
                <Link
                  to="/transactions"
                  className="text-gray-600 hover:text-agilbank-primary transition-colors"
                >
                  Transações
                </Link>
                <Link
                  to="/account"
                  className="text-gray-600 hover:text-agilbank-primary transition-colors"
                >
                  Conta
                </Link>
                <Link
                  to="/verificacao-identidade"
                  className="text-gray-600 hover:text-agilbank-primary transition-colors"
                >
                  Identidade
                </Link>
              </>
            ) : (
              <>
                <Link
                  to="/"
                  className="text-gray-600 hover:text-agilbank-primary transition-colors"
                >
                  Início
                </Link>
                <Link
                  to="/terms"
                  className="text-gray-600 hover:text-agilbank-primary transition-colors"
                >
                  Termos
                </Link>
              </>
            )}
          </div>

          {/* User Menu / Auth Buttons */}
          <div className="hidden md:flex items-center space-x-4">
            {isAuthenticated ? (
              <div className="relative">
                <button
                  onClick={toggleUserMenu}
                  className="flex items-center space-x-2 text-gray-700 hover:text-agilbank-primary transition-colors"
                >
                  <UserCircleIcon className="h-6 w-6" />
                  <span className="text-sm font-medium">
                    {user?.nomeCompleto || 'Usuário'}
                  </span>
                </button>

                {isUserMenuOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                    <div className="px-4 py-2 border-b border-gray-200">
                      <p className="text-sm font-medium text-gray-900">
                        {user?.nomeCompleto}
                      </p>
                      <p className="text-xs text-gray-500">
                        {user?.email}
                      </p>
                    </div>
                    
                    <Link
                      to="/account"
                      className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      onClick={() => setIsUserMenuOpen(false)}
                    >
                      <Cog6ToothIcon className="h-4 w-4 mr-2" />
                      Configurações
                    </Link>

                    <Link
                      to="/verificacao-identidade"
                      className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      onClick={() => setIsUserMenuOpen(false)}
                    >
                      <IdentificationIcon className="h-4 w-4 mr-2" />
                      Verificação de identidade
                    </Link>
                    
                    <Link
                      to="/terms"
                      className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      onClick={() => setIsUserMenuOpen(false)}
                    >
                      <ShieldCheckIcon className="h-4 w-4 mr-2" />
                      Termos de Uso
                    </Link>
                    
                    <button
                      onClick={handleLogout}
                      className="flex items-center w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                    >
                      <ArrowRightOnRectangleIcon className="h-4 w-4 mr-2" />
                      Sair
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center space-x-3">
                <Link to="/login">
                  <Button variant="ghost" size="sm">
                    Entrar
                  </Button>
                </Link>
                <Link to="/register">
                  <Button variant="primary" size="sm">
                    Criar Conta
                  </Button>
                </Link>
              </div>
            )}
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden">
            <button
              onClick={toggleMenu}
              className="text-gray-600 hover:text-agilbank-primary transition-colors"
            >
              {isMenuOpen ? (
                <XMarkIcon className="h-6 w-6" />
              ) : (
                <Bars3Icon className="h-6 w-6" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isMenuOpen && (
          <div className="md:hidden border-t border-gray-200 py-4">
            <div className="space-y-2">
              {isAuthenticated ? (
                <>
                  <Link
                    to="/transactions"
                    className="block px-4 py-2 text-gray-600 hover:text-agilbank-primary hover:bg-gray-50 rounded-lg transition-colors"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    Transações
                  </Link>
                  <Link
                    to="/account"
                    className="block px-4 py-2 text-gray-600 hover:text-agilbank-primary hover:bg-gray-50 rounded-lg transition-colors"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    Conta
                  </Link>
                  <Link
                    to="/verificacao-identidade"
                    className="block px-4 py-2 text-gray-600 hover:text-agilbank-primary hover:bg-gray-50 rounded-lg transition-colors"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    Verificação de identidade
                  </Link>
                  <div className="border-t border-gray-200 pt-2 mt-2">
                    <div className="px-4 py-2">
                      <p className="text-sm font-medium text-gray-900">
                        {user?.nomeCompleto}
                      </p>
                      <p className="text-xs text-gray-500">
                        {user?.email}
                      </p>
                    </div>
                    <button
                      onClick={handleLogout}
                      className="flex items-center w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <ArrowRightOnRectangleIcon className="h-4 w-4 mr-2" />
                      Sair
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <Link
                    to="/"
                    className="block px-4 py-2 text-gray-600 hover:text-agilbank-primary hover:bg-gray-50 rounded-lg transition-colors"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    Início
                  </Link>
                  <Link
                    to="/terms"
                    className="block px-4 py-2 text-gray-600 hover:text-agilbank-primary hover:bg-gray-50 rounded-lg transition-colors"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    Termos
                  </Link>
                  <div className="border-t border-gray-200 pt-2 mt-2 space-y-2">
                    <Link
                      to="/login"
                      className="block px-4 py-2 text-center text-agilbank-primary hover:bg-blue-50 rounded-lg transition-colors"
                      onClick={() => setIsMenuOpen(false)}
                    >
                      Entrar
                    </Link>
                    <Link
                      to="/register"
                      className="block px-4 py-2 text-center bg-agilbank-primary text-white hover:bg-blue-700 rounded-lg transition-colors"
                      onClick={() => setIsMenuOpen(false)}
                    >
                      Criar Conta
                    </Link>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
