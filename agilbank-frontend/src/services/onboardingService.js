/**
 * Cliente HTTP da proposta temporária de abertura de conta.
 * Usa cookie HTTP-only (credentials) — não persiste obt_* nem JWT em storage.
 */

const API_BASE = import.meta.env.VITE_API_URL || '';

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
export async function createApplication() {
  const res = await fetch(`${API_BASE}/api/onboarding/applications`, {
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
export async function getCurrentApplicationStatus() {
  const res = await fetch(`${API_BASE}/api/onboarding/applications/current/status`, {
    method: 'GET',
    credentials: 'include',
  });
  return parseJson(res);
}

/**
 * Encerra sessão de onboarding e limpa cookie.
 */
export async function logoutOnboarding() {
  const res = await fetch(`${API_BASE}/api/onboarding/logout`, {
    method: 'POST',
    credentials: 'include',
  });
  return parseJson(res);
}
