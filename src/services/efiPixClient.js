'use strict';

const fs = require('fs');
const crypto = require('crypto');
const https = require('https');
const axios = require('axios');
const logger = require('../utils/logger');

/** Homologação Efí Pix. */
const SANDBOX_BASE = 'https://pix-h.api.efipay.com.br';
/** Produção Efí Pix (doc Efí: mesma família de host que homologação `pix-h`). */
const PRODUCTION_BASE = 'https://pix.api.efipay.com.br';

class EfiPixClientError extends Error {
  constructor(code, message, httpStatus = 502) {
    super(message);
    this.name = 'EfiPixClientError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

function getEfiEnvironment() {
  return String(process.env.EFI_ENVIRONMENT || 'sandbox').toLowerCase();
}

function isProductionEfiEnv() {
  return getEfiEnvironment() === 'production';
}

/** Opt-in explícito para cobrança Pix Efí em produção (Fase N-PROD; sem settlement nesta fase). */
function isProductionPixExplicitlyEnabled() {
  return String(process.env.EFI_PIX_ENABLE_PRODUCTION || '').trim().toLowerCase() === 'true';
}

function isProductionPixAllowed() {
  return isProductionEfiEnv() && isProductionPixExplicitlyEnabled();
}

/**
 * Produção sem flag: bloqueado (não usar credenciais de prod contra host de homologação por engano).
 * Sandbox: credenciais + cert + chave.
 */
function isEfiPixConfigured() {
  if (isProductionEfiEnv() && !isProductionPixExplicitlyEnabled()) {
    return false;
  }
  const id = process.env.EFI_CLIENT_ID && String(process.env.EFI_CLIENT_ID).trim();
  const secret = process.env.EFI_CLIENT_SECRET && String(process.env.EFI_CLIENT_SECRET).trim();
  const pixKey = process.env.EFI_PIX_KEY && String(process.env.EFI_PIX_KEY).trim();
  const hasCert =
    (process.env.EFI_CERTIFICATE_PATH && String(process.env.EFI_CERTIFICATE_PATH).trim()) ||
    (process.env.EFI_CERTIFICATE_BASE64 && String(process.env.EFI_CERTIFICATE_BASE64).trim());
  return !!(id && secret && pixKey && hasCert);
}

function getBaseUrl() {
  return isProductionPixAllowed() ? PRODUCTION_BASE : SANDBOX_BASE;
}

/** Limite opcional de valor (original) em produção, ex.: `10.00` — vazio = sem teto no código. */
function enforceProductionAmountCap(originalStr) {
  if (!isProductionPixAllowed()) return;
  const raw = process.env.EFI_PIX_PRODUCTION_MAX_ORIGINAL;
  if (raw == null || !String(raw).trim()) return;
  const max = Number(String(raw).trim().replace(',', '.'));
  const val = Number(originalStr);
  if (!Number.isFinite(max) || max <= 0) return;
  if (val > max) {
    throw new EfiPixClientError(
      'EFI_AMOUNT_ABOVE_PRODUCTION_CAP',
      `Valor acima do limite operacional configurado para produção (${max.toFixed(2)}).`,
      400,
    );
  }
}

function loadPfxBuffer() {
  const b64 = process.env.EFI_CERTIFICATE_BASE64 && String(process.env.EFI_CERTIFICATE_BASE64).trim();
  if (b64) {
    return Buffer.from(b64, 'base64');
  }
  const p = process.env.EFI_CERTIFICATE_PATH && String(process.env.EFI_CERTIFICATE_PATH).trim();
  if (p) {
    return fs.readFileSync(p);
  }
  throw new EfiPixClientError('EFI_CERT_MISSING', 'Certificado Efí não configurado', 503);
}

function buildHttpsAgent() {
  const pfx = loadPfxBuffer();
  const passphrase = process.env.EFI_CERTIFICATE_PASS
    ? String(process.env.EFI_CERTIFICATE_PASS)
    : '';
  return new https.Agent({
    pfx,
    passphrase,
  });
}

/**
 * txid Efí: 26 a 35 caracteres alfanuméricos [a-zA-Z0-9]
 */
function generateTxid() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const len = 28;
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i += 1) {
    out += chars[bytes[i] % chars.length];
  }
  return out;
}

function formatMoneyOriginal(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) {
    throw new EfiPixClientError('EFI_INVALID_AMOUNT', 'Valor inválido para cobrança Pix', 400);
  }
  return (Math.round(n * 100) / 100).toFixed(2);
}

function onlyDigitsCpf(cpf) {
  return String(cpf || '').replace(/\D/g, '');
}

async function fetchAccessToken(httpsAgent, baseUrl) {
  const clientId = String(process.env.EFI_CLIENT_ID).trim();
  const clientSecret = String(process.env.EFI_CLIENT_SECRET).trim();
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const url = `${baseUrl}/oauth/token`;
  try {
    const { data } = await axios.post(
      url,
      { grant_type: 'client_credentials' },
      {
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
        httpsAgent,
        timeout: 30000,
      },
    );
    if (!data || !data.access_token) {
      throw new EfiPixClientError('EFI_TOKEN_INVALID', 'Resposta de token Efí inválida', 502);
    }
    return data.access_token;
  } catch (err) {
    if (err instanceof EfiPixClientError) throw err;
    const status = err.response && err.response.status;
    logger.error('efi_pix_oauth_failed', {
      category: 'operational_error',
      component: 'efiPixClient',
      status: status || null,
      message: err.message,
    });
    throw new EfiPixClientError(
      'EFI_OAUTH_FAILED',
      'Falha ao autenticar na API Efí (credenciais ou certificado)',
      502,
    );
  }
}

async function fetchLocQrCode(httpsAgent, baseUrl, token, locId) {
  const url = `${baseUrl}/v2/loc/${encodeURIComponent(String(locId))}/qrcode`;
  try {
    const { data } = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      httpsAgent,
      timeout: 30000,
    });
    if (data && data.imagemQrcode) {
      return String(data.imagemQrcode).trim();
    }
    if (data && data.qrcode) {
      return String(data.qrcode).trim();
    }
    return null;
  } catch (err) {
    const status = err.response && err.response.status;
    logger.warn('efi_pix_qrcode_fetch_failed', {
      category: 'operational_error',
      component: 'efiPixClient',
      locId: String(locId),
      httpStatus: status || null,
      message: err.message,
    });
    return null;
  }
}

/**
 * Cria cobrança imediata (PUT /v2/cob/:txid) na Efí.
 * Não registra pagamento; apenas emissão da cobrança.
 *
 * @param {object} params
 * @param {string} params.txid
 * @param {number|string} params.amount
 * @param {string} params.debtorCpf — apenas dígitos
 * @param {string} params.debtorName
 * @param {number} [params.expirationSeconds]
 * @returns {Promise<{ txid: string, pixCopiaECola: string|null, qrCodePix: string|null, status: string, providerReference: string|null, expiresAt: Date, raw: object }>}
 */
async function createImmediateCob(params) {
  if (isProductionEfiEnv() && !isProductionPixExplicitlyEnabled()) {
    throw new EfiPixClientError(
      'EFI_PRODUCTION_NOT_ENABLED',
      'Produção Efí exige EFI_PIX_ENABLE_PRODUCTION=true (cobrança apenas; sem settlement automático).',
      403,
    );
  }
  if (!isEfiPixConfigured()) {
    throw new EfiPixClientError('EFI_NOT_CONFIGURED', 'Integração Efí Pix não configurada', 503);
  }

  const { txid, amount, debtorCpf, debtorName } = params;
  const expirationSeconds = parseInt(process.env.EFI_PIX_EXPIRATION_SECONDS, 10) || 3600;
  const pixKey = String(process.env.EFI_PIX_KEY).trim();
  const cpf = onlyDigitsCpf(debtorCpf);
  if (cpf.length !== 11) {
    throw new EfiPixClientError('EFI_DEBTOR_CPF', 'CPF do devedor inválido para cobrança Pix', 400);
  }
  const nome = String(debtorName || 'Cliente').trim().slice(0, 100);
  const original = formatMoneyOriginal(amount);
  enforceProductionAmountCap(original);

  const httpsAgent = buildHttpsAgent();
  const baseUrl = getBaseUrl();
  const token = await fetchAccessToken(httpsAgent, baseUrl);

  const body = {
    calendario: {
      expiracao: expirationSeconds,
    },
    devedor: {
      cpf,
      nome: nome || 'Cliente',
    },
    valor: {
      original,
    },
    chave: pixKey,
  };

  const url = `${baseUrl}/v2/cob/${encodeURIComponent(txid)}`;
  let data;
  try {
    const res = await axios.put(url, body, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      httpsAgent,
      timeout: 45000,
    });
    data = res.data;
  } catch (err) {
    const status = err.response && err.response.status;
    const detail = err.response && err.response.data;
    logger.error('efi_pix_cob_put_failed', {
      category: 'operational_error',
      component: 'efiPixClient',
      txid,
      httpStatus: status || null,
      message: err.message,
      detail: detail ? JSON.stringify(detail).slice(0, 500) : null,
    });
    throw new EfiPixClientError(
      'EFI_COB_FAILED',
      'Falha ao criar cobrança Pix na Efí',
      status && status < 500 ? status : 502,
    );
  }

  const pixCopiaECola = data.pixCopiaECola ? String(data.pixCopiaECola).trim() : null;
  let providerReference = null;
  if (data.loc && data.loc.id != null) {
    providerReference = String(data.loc.id);
  }
  const status = data.status ? String(data.status) : 'ATIVA';
  const expSec = data.calendario && data.calendario.expiracao != null ? Number(data.calendario.expiracao) : expirationSeconds;
  const expiresAt = new Date(Date.now() + Math.max(60, expSec) * 1000);

  let qrCodePix = null;
  if (providerReference) {
    qrCodePix = await fetchLocQrCode(httpsAgent, baseUrl, token, providerReference);
  }

  return {
    txid: data.txid || txid,
    pixCopiaECola,
    qrCodePix,
    status,
    providerReference,
    expiresAt,
    raw: data,
  };
}

module.exports = {
  EfiPixClientError,
  isEfiPixConfigured,
  getBaseUrl,
  getEfiEnvironment,
  isProductionEfiEnv,
  isProductionPixExplicitlyEnabled,
  isProductionPixAllowed,
  generateTxid,
  createImmediateCob,
};
