const AUTH_TOKEN_KEY = 'agilbank_token';
const AUTH_USER_KEY = 'agilbank_user';
const LEGACY_TOKEN_KEY = 'govbr_token';
const LEGACY_USER_KEY = 'govbr_user';
const LEGACY_LOGIN_KEY = 'govbr_login';

const hasStorage = () => typeof window !== 'undefined';

const notifyAuthChanged = () => {
  if (hasStorage()) {
    window.dispatchEvent(new Event('agilbank-auth-changed'));
  }
};

export const clearStoredAuth = () => {
  if (!hasStorage()) {
    return;
  }

  sessionStorage.removeItem(AUTH_TOKEN_KEY);
  sessionStorage.removeItem(AUTH_USER_KEY);
  sessionStorage.removeItem(LEGACY_TOKEN_KEY);
  sessionStorage.removeItem(LEGACY_USER_KEY);
  sessionStorage.removeItem(LEGACY_LOGIN_KEY);
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
  localStorage.removeItem(LEGACY_TOKEN_KEY);
  localStorage.removeItem(LEGACY_USER_KEY);
  localStorage.removeItem(LEGACY_LOGIN_KEY);
  notifyAuthChanged();
};

export const getStoredAuth = () => {
  if (!hasStorage()) {
    return { token: null, userData: null };
  }

  const token = sessionStorage.getItem(AUTH_TOKEN_KEY);
  const userData = sessionStorage.getItem(AUTH_USER_KEY);

  if (!token || !userData) {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_USER_KEY);
    localStorage.removeItem(LEGACY_TOKEN_KEY);
    localStorage.removeItem(LEGACY_USER_KEY);
    localStorage.removeItem(LEGACY_LOGIN_KEY);
  } else {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
    localStorage.setItem(AUTH_USER_KEY, userData);
    localStorage.setItem(LEGACY_TOKEN_KEY, token);
    localStorage.setItem(LEGACY_USER_KEY, userData);
  }

  return {
    token,
    userData,
  };
};

export const storeAuthSession = (token, user) => {
  if (!hasStorage()) {
    return;
  }

  sessionStorage.setItem(AUTH_TOKEN_KEY, token);
  const userData = JSON.stringify(user);
  sessionStorage.setItem(AUTH_USER_KEY, userData);
  sessionStorage.setItem(LEGACY_TOKEN_KEY, token);
  sessionStorage.setItem(LEGACY_USER_KEY, userData);
  localStorage.setItem(AUTH_TOKEN_KEY, token);
  localStorage.setItem(AUTH_USER_KEY, userData);
  localStorage.setItem(LEGACY_TOKEN_KEY, token);
  localStorage.setItem(LEGACY_USER_KEY, userData);
  notifyAuthChanged();
};
