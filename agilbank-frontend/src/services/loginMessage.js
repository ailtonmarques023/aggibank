/**
 * Mensagens de login (credenciais vs rede vs rate limit).
 * Contrato UX do AgilBank — não repetir erro técnico cru na UI.
 */

export const LOGIN_MESSAGES = Object.freeze({
  credential:
    'Não encontramos uma conta com esses dados ou a senha está incorreta.',
  rateLimit: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
  connect: 'Não foi possível conectar ao AgilBank agora. Tente novamente em instantes.',
});

/** Evita eco de erro técnico na UI mesmo que o servidor devolva texto perigoso. */
const TECHNICAL_HINT =
  /prisma|p\d{4}|postgresql|postgres|unique constraint|internal server error|stack trace|\bstack\b|ECONNREFUSED|cors\b|blocked by cors|certificate|ssl|tunnel|timed out unexpectedly/i;

/**
 * @param {unknown} err — erro axios OU objeto enriquecido pelo authService
 * @returns {string}
 */
export function resolveLoginUserFacingMessage(err) {
  if (!err || typeof err !== 'object') {
    return LOGIN_MESSAGES.connect;
  }

  const status =
    typeof err.response?.status === 'number'
      ? err.response.status
      : typeof err.loginHttpStatus === 'number'
        ? err.loginHttpStatus
        : null;

  const axiosCode = typeof err.code === 'string' ? err.code : '';
  const loginAxiosCode = typeof err.loginAxiosCode === 'string' ? err.loginAxiosCode : '';

  const hasRequestWithoutResponse =
    err.loginHadRequest === true || (!!err.request && typeof err.response === 'undefined');

  const isNetworkTransportFailure =
    hasRequestWithoutResponse ||
    axiosCode === 'ERR_NETWORK' ||
    loginAxiosCode === 'ERR_NETWORK' ||
    axiosCode === 'ECONNABORTED' ||
    loginAxiosCode === 'ECONNABORTED';

  const apiBody =
    typeof err.response?.data === 'object' && err.response.data !== null ? err.response.data : null;
  const enrichedThrow =
    !err.response &&
    typeof err.message === 'string' &&
    (typeof err.loginHttpStatus === 'number' ||
      err.success === false ||
      typeof err.code === 'string')
      ? err
      : null;

  const declaredPayloadFailure =
    apiBody?.success === false ||
    enrichedThrow?.success === false ||
    err.success === false;

  const rawBackendMsg =
    (typeof apiBody?.message === 'string' ? apiBody.message.trim() : '') ||
    (typeof enrichedThrow?.message === 'string' ? enrichedThrow.message.trim() : '');

  if (TECHNICAL_HINT.test(rawBackendMsg)) {
    return LOGIN_MESSAGES.connect;
  }

  if (status === 429) {
    return LOGIN_MESSAGES.rateLimit;
  }

  /** Infra/upstream ou timeout solicitado */
  if ([500, 502, 503, 504].includes(status) || status === 408 || (typeof status === 'number' && status >= 521)) {
    return LOGIN_MESSAGES.connect;
  }

  if (status === null && isNetworkTransportFailure) {
    return LOGIN_MESSAGES.connect;
  }

  /** Credenciais/contrato 4xx esperados */
  const credentialByHttp = [400, 401, 404].includes(status);

  /** Falha declarada pela API ou envelope sintético (ex.: cliente sem número HTTP quando não há transporte falho). */
  const credentialByPayload =
    declaredPayloadFailure &&
    !isNetworkTransportFailure &&
    (status === null ||
      (typeof status === 'number' && status !== 408 && status !== 429 && status < 500));

  if (credentialByHttp || credentialByPayload) {
    return LOGIN_MESSAGES.credential;
  }

  if (typeof status === 'number' && status >= 500) {
    return LOGIN_MESSAGES.connect;
  }

  return LOGIN_MESSAGES.connect;
}
