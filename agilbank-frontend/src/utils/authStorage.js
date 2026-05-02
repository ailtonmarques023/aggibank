const AUTH_TOKEN_KEY = 'agilbank_token';
const AUTH_USER_KEY = 'agilbank_user';

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
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
  notifyAuthChanged();
};

export const getStoredAuth = () => {
  if (!hasStorage()) {
    return { token: null, userData: null };
  }

  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);

  return {
    token: sessionStorage.getItem(AUTH_TOKEN_KEY),
    userData: sessionStorage.getItem(AUTH_USER_KEY),
  };
};

export const storeAuthSession = (token, user) => {
  if (!hasStorage()) {
    return;
  }

  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
  sessionStorage.setItem(AUTH_TOKEN_KEY, token);
  sessionStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
  notifyAuthChanged();
};
