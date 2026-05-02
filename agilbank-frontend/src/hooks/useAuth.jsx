import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';
import { clearStoredAuth, getStoredAuth, storeAuthSession } from '../utils/authStorage';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { token, userData } = getStoredAuth();

    if (token && userData) {
      try {
        const parsedUser = JSON.parse(userData);
        setIsAuthenticated(true);
        setUser(parsedUser);
        // Set token for API requests
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      } catch (error) {
        console.error('Erro ao fazer parse do userData ou token inválido:', error);
        logout(); // Clear corrupted data
      }
    }
    setLoading(false);
  }, []);

  const login = async (email, password) => {
    setLoading(true);
    try {
      const response = await api.post('/auth/login', { email, senha: password });
      const { token, user } = response.data.data || response.data;

      storeAuthSession(token, user);
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      setIsAuthenticated(true);
      setUser(user);
      setLoading(false);
      return { success: true };
    } catch (error) {
      setLoading(false);
      return { success: false, message: error.response?.data?.message || 'Erro ao fazer login' };
    }
  };


  const register = async (userData) => {
    setLoading(true);
    try {
      const response = await api.post('/auth/register', userData);
      setLoading(false);
      return {
        success: true,
        ...(response.data || {}),
        data: response.data?.data || response.data,
      };
    } catch (error) {
      setLoading(false);
      return {
        success: false,
        error: error.response?.data?.message || error.response?.data?.errors?.[0]?.message || 'Erro ao criar conta',
      };
    }
  };
  const logout = () => {
    clearStoredAuth();
    delete api.defaults.headers.common['Authorization'];
    setIsAuthenticated(false);
    setUser(null);
    setLoading(false);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, user, loading, login, register, logout, setIsAuthenticated, setUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
