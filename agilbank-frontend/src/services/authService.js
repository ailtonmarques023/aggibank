import api from './api';

export const authService = {
  async login(email, senha) {
    try {
      const response = await api.post('/auth/login', { email, senha });
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
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
      localStorage.removeItem('agilbank_token');
      localStorage.removeItem('agilbank_user');
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
