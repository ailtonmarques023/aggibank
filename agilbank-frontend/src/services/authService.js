import api from './api';
import { clearStoredAuth } from '../utils/authStorage';

export const authService = {
  async login(email, senha) {
    try {
      const response = await api.post('/auth/login', { email, senha });
      return {
        ...response.data,
        ...(response.data?.data || {}),
      };
    } catch (error) {
      throw error.response?.data || {
        code: error.code,
        message: error.message,
        request: Boolean(error.request),
      };
    }
  },

  async register(userData) {
    try {
      const response = await api.post('/auth/register', userData);
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  },

  async logout() {
    try {
      await api.post('/auth/logout');
    } catch (error) {
      console.error('Erro ao fazer logout:', error);
    } finally {
      clearStoredAuth();
    }
  },

  async getProfile() {
    try {
      const response = await api.get('/auth/profile');
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  }
};
