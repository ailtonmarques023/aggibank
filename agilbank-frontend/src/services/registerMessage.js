/**
 * Mensagens de cadastro público (/auth/register) — rede vs validação/conflito vs rate-limit.
 */

export const REGISTER_MESSAGES = Object.freeze({
  connectivity:
    'Não foi possível criar sua conta agora. Verifique sua conexão e tente novamente em instantes.',
  rateLimit: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
  activeApplication:
    'Já existe uma proposta em andamento com este CPF ou e-mail. Aguarde a conclusão ou entre em contato com o suporte.',
});

const TECH_HINT =
  /prisma|p\d{4}|postgresql|unique constraint|stack trace|failed to fetch|network error|ECONNREFUSED|cors\b|internal server error/i;

export function sanitizeRegisterApiMessage(message) {
  if (message == null || typeof message !== 'string') return '';
  const t = message.trim();
  if (!t) return '';
  if (/prisma|p2002|postgresql|unique constraint|stack trace|internal server error/i.test(t)) {
    return REGISTER_MESSAGES.connectivity;
  }
  return t;
}

/**
 * @param {import('axios').AxiosError} error
 * @returns {{ message: string, code?: string, httpStatus?: number|null, duplicateField?: string }}
 */
export function resolveRegisterFailure(error) {
  const status = typeof error?.response?.status === 'number' ? error.response.status : null;
  const payload =
    error?.response?.data && typeof error.response.data === 'object' ? error.response.data : {};

  const fromErrorsArr = Array.isArray(payload.errors)
    ? payload.errors
        .map((e) => (typeof e?.message === 'string' ? e.message.trim() : ''))
        .filter(Boolean)
    : [];

  const rawCombined =
    (typeof payload.message === 'string' && payload.message.trim()) ||
    (fromErrorsArr.length > 0 ? fromErrorsArr.join(' ') : null) ||
    (typeof payload.error === 'string' && payload.error.trim()) ||
    '';

  const axiosCode = typeof error?.code === 'string' ? error.code : '';
  const noResponseTransport =
    !!(error?.request && typeof error.response === 'undefined');

  /** CORS pré-flight ou rede que nem chega a JSON aplicacional */
  if (
    status === null &&
    (noResponseTransport ||
      axiosCode === 'ERR_NETWORK' ||
      axiosCode === 'ECONNABORTED' ||
      /Network Error|cors/i.test(String(error?.message || '')))
  ) {
    return {
      message: REGISTER_MESSAGES.connectivity,
      httpStatus: null,
      code: payload.code,
      duplicateField: payload.duplicateField,
    };
  }

  if (status === 429) {
    return {
      message: REGISTER_MESSAGES.rateLimit,
      httpStatus: status,
      code: payload.code || 'AUTH_RATE_LIMITED',
    };
  }

  if ([500, 502, 503, 504].includes(status) || (typeof status === 'number' && status >= 520)) {
    return { message: REGISTER_MESSAGES.connectivity, httpStatus: status, code: payload.code };
  }

  /** 400 validação ou 409 duplicidade: usa texto da API (sanitizado) */
  if (status === 400 || status === 409 || status === 422) {
    const safe = sanitizeRegisterApiMessage(rawCombined) || REGISTER_MESSAGES.connectivity;
    if (TECH_HINT.test(rawCombined)) {
      return {
        message: REGISTER_MESSAGES.connectivity,
        httpStatus: status,
        code: payload.code,
        duplicateField: payload.duplicateField,
      };
    }
    return {
      message: safe,
      httpStatus: status,
      code: payload.code,
      duplicateField: payload.duplicateField,
    };
  }

  if (rawCombined && !TECH_HINT.test(rawCombined)) {
    return {
      message: sanitizeRegisterApiMessage(rawCombined),
      httpStatus: status,
      code: payload.code,
      duplicateField: payload.duplicateField,
    };
  }

  return {
    message: REGISTER_MESSAGES.connectivity,
    httpStatus: status,
    code: payload.code,
    duplicateField: payload.duplicateField,
  };
}
