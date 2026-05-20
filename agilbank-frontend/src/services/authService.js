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
      /** Preserva HTTP status/códigos Axios para classify credenciais x rede/rate-limit */
      const base = typeof error.response?.data === 'object' && error.response.data !== null ? { ...error.response.data } : {};
      throw Object.assign(base, {
        loginHttpStatus: typeof error.response?.status === 'number' ? error.response.status : null,
        loginAxiosCode: typeof error.code === 'string' ? error.code : '',
        loginHadRequest:
          !!(error.request && typeof error.response === 'undefined'),
      });
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
      if (import.meta.env.DEV) {
        console.error('Erro ao fazer logout:', error);
      }
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

export { resolveLoginUserFacingMessage } from './loginMessage';
