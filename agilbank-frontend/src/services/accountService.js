import api from './api';

export const accountService = {
  async getBalance() {
    try {
      const response = await api.get('/account/balance');
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  },

  async transfer(transferData) {
    try {
      const response = await api.post('/pix/send', transferData);
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  },

  async getAccountInfo() {
    try {
      const response = await api.get('/account/info');
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  }
};
