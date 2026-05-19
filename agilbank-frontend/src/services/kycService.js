import api from './api';

/** Tipos MIME aceitos pelo backend KYC (ADR). */
export const KYC_ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** Limite alinhado ao default do backend quando `KYC_UPLOAD_MAX_BYTES` não está definido. */
export const KYC_MAX_FILE_BYTES = 15 * 1024 * 1024;

function unwrap(apiPayload, fallbackMessage) {
  if (!apiPayload || typeof apiPayload !== 'object') {
    throw new Error(fallbackMessage || 'Resposta inválida da API.');
  }
  if (apiPayload.success !== true) {
    const msg =
      typeof apiPayload.message === 'string' && apiPayload.message.trim()
        ? apiPayload.message.trim()
        : fallbackMessage || 'Operação não concluída.';
    const err = new Error(msg);
    err.code = typeof apiPayload.code === 'string' ? apiPayload.code : undefined;
    throw err;
  }
  return apiPayload.data;
}

/** @returns {Promise<object>} payload `data` de GET /me/kyc-status */
export async function fetchKycStatus() {
  const { data } = await api.get('/me/kyc-status');
  return unwrap(data, 'Não foi possível carregar o status da verificação.');
}

/**
 * @param {{ artifactType: string, mimeType: string, byteSize: number }} body
 */
export async function presignKycUpload(body) {
  const { data } = await api.post('/me/kyc/presign', body);
  return unwrap(data, 'Não foi possível preparar o envio.');
}

/**
 * @param {{ artifactId: string, checksumSHA256?: string }} body
 */
export async function confirmKycUpload(body) {
  const { data } = await api.post('/me/kyc/confirm-upload', body);
  return unwrap(data, 'Não foi possível confirmar o arquivo.');
}

export async function submitKycForReview() {
  const { data } = await api.post('/me/kyc/submit');
  return unwrap(data, 'Não foi possível enviar para análise.');
}

/**
 * Upload direto ao armazenamento (URL pré-assinada). Nunca registrar `uploadUrl` no console.
 */
export async function putFileToPresignedUrl(uploadUrl, file, headers) {
  const h = new Headers();
  if (headers && typeof headers === 'object') {
    Object.entries(headers).forEach(([k, v]) => {
      if (v != null) h.set(k, String(v));
    });
  }
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    body: file,
    headers: h,
  });
  if (!res.ok) {
    throw new Error(
      `O armazenamento não aceitou o arquivo (${res.status}). Confira sua conexão e tente novamente.`
    );
  }
}

export async function sha256HexFromFile(file) {
  const buf = await file.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', buf);
  const bytes = new Uint8Array(hash);
  let hex = '';
  for (let i = 0; i < bytes.length; i += 1) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}
