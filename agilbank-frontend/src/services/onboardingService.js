/**
 * Cliente HTTP da proposta temporária de abertura de conta.
 * Usa cookie HTTP-only (credentials) — não persiste obt_* nem JWT em storage.
 */

/** Mesma base que `api.js`: termina em `/api` (same-origin ou Railway). */

/**
 * Cookie `agilbank_onboarding_session` só funciona como first-party.
 * No Vercel, `/api` passa pelo rewrite (vercel.json) → Railway com mesmo host do front.
 * URL Railway direta cross-origin é bloqueada por navegadores modernos (3rd-party cookie).
 */
function resolveOnboardingApiBase() {
  const configured = String(import.meta.env.VITE_API_URL || '').trim().replace(/\/+$/, '');

  if (typeof window === 'undefined') {
    return configured || '/api';
  }

  if (!configured) {
    return '/api';
  }

  if (configured.startsWith('/')) {
    return configured;
  }

  try {
    const apiOrigin = new URL(
      configured.includes('://') ? configured : `https://${configured}`
    ).origin;
    if (import.meta.env.PROD && apiOrigin !== window.location.origin) {
      return '/api';
    }
  } catch (_) {
    return configured;
  }

  return configured;
}

const API_BASE = resolveOnboardingApiBase();

async function parseJson(res) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.message || 'Erro na proposta de abertura');
    err.code = body.code;
    err.status = res.status;
    throw err;
  }
  return body;
}

/**
 * Inicia proposta DRAFT; cookie agilbank_onboarding_session é definida pelo servidor.
 */
/** Flag de build: fluxo novo de abertura (cookie HTTP-only). */
export function isOnboardingRegisterEnabled() {
  return String(import.meta.env.VITE_ONBOARDING_APPLICATION_ENABLED || '').toLowerCase().trim() === 'true';
}

export async function createApplication() {
  const res = await fetch(`${API_BASE}/onboarding/applications`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  return parseJson(res);
}

/**
 * Status da proposta vinculada à cookie de sessão.
 */
/**
 * Persiste dados pessoais/endereço/senha na proposta (cookie).
 */
export async function updateCurrentApplication(body) {
  const res = await fetch(`${API_BASE}/onboarding/applications/current`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return parseJson(res);
}

export async function getCurrentApplicationStatus() {
  const res = await fetch(`${API_BASE}/onboarding/applications/current/status`, {
    method: 'GET',
    credentials: 'include',
  });
  return parseJson(res);
}

/**
 * Encerra sessão de onboarding e limpa cookie.
 */
export async function logoutOnboarding() {
  const res = await fetch(`${API_BASE}/onboarding/logout`, {
    method: 'POST',
    credentials: 'include',
  });
  return parseJson(res);
}

/** Status KYC da proposta (cookie HTTP-only). */
export async function getOnboardingKycStatus() {
  const res = await fetch(`${API_BASE}/onboarding/kyc/status`, {
    method: 'GET',
    credentials: 'include',
  });
  return parseJson(res);
}

export async function presignOnboardingKycArtifact(body) {
  const res = await fetch(`${API_BASE}/onboarding/kyc/presign`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return parseJson(res);
}

export async function confirmOnboardingKycUpload(body) {
  const res = await fetch(`${API_BASE}/onboarding/kyc/confirm-upload`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return parseJson(res);
}

export async function submitOnboardingKycForReview() {
  const res = await fetch(`${API_BASE}/onboarding/kyc/submit`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  return parseJson(res);
}

/**
 * Finaliza proposta (cria User/conta). Não retorna JWT — próximo passo é login normal.
 */
export async function finalizeOnboarding(body) {
  const res = await fetch(`${API_BASE}/onboarding/finalize`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return parseJson(res);
}
