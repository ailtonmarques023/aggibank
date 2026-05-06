import axios from 'axios';
import { clearStoredAuth, getStoredAuth } from '../utils/authStorage';

/** Deve ser a URL do backend (Railway), não o host do front (Vercel). */
const RAILWAY_API_DEFAULT = 'https://aggibank-production.up.railway.app/api';
const apiBaseURL =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? '/api' : RAILWAY_API_DEFAULT);

const api = axios.create({
  baseURL: apiBaseURL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    const { token } = getStoredAuth();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    const isLoginRequest = error.config?.url?.includes('/auth/login');

    if (error.response?.status === 401 && !isLoginRequest) {
      // Token expirado ou inválido
      clearStoredAuth();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
