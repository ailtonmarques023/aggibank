import api from './api';

export const transactionsService = {
  async getTransactions(params = {}) {
    try {
      const response = await api.get('/transactions', { params });
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  },

  async getTransactionById(id) {
    try {
      const response = await api.get(`/transactions/${id}`);
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  }
};
