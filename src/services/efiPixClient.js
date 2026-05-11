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

/**
 * PUT /v2/webhook/:chave — cadastra URL de notificação Pix (escopo webhook.write).
 * @param {{ webhookUrl: string, skipMtlsChecking?: boolean }} params
 */
async function putPixWebhook(params) {
  if (!isEfiPixConfigured()) {
    throw new EfiPixClientError('EFI_NOT_CONFIGURED', 'Integração Efí Pix não configurada', 503);
  }
  if (isProductionEfiEnv() && !isProductionPixExplicitlyEnabled()) {
    throw new EfiPixClientError(
      'EFI_PRODUCTION_NOT_ENABLED',
      'Produção Efí exige EFI_PIX_ENABLE_PRODUCTION=true',
      403,
    );
  }
  const webhookUrl = String(params.webhookUrl || '').trim();
  if (!webhookUrl) {
    throw new EfiPixClientError('EFI_WEBHOOK_URL_INVALID', 'webhookUrl obrigatório', 400);
  }
  const skipMtlsDefault = String(process.env.EFI_PIX_WEBHOOK_SKIP_MTLS || 'true').toLowerCase() === 'true';
  const skipMtls =
    params.skipMtlsChecking === undefined ? skipMtlsDefault : Boolean(params.skipMtlsChecking);
  const pixKey = String(process.env.EFI_PIX_KEY).trim();
  const httpsAgent = buildHttpsAgent();
  const baseUrl = getBaseUrl();
  const token = await fetchAccessToken(httpsAgent, baseUrl);
  const pathKey = encodeURIComponent(pixKey);
  const url = `${baseUrl}/v2/webhook/${pathKey}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  if (skipMtls) {
    headers['x-skip-mtls-checking'] = 'true';
  }
  try {
    const res = await axios.put(
      url,
      { webhookUrl },
      {
        headers,
        httpsAgent,
        timeout: 45000,
      },
    );
    return { httpStatus: res.status, data: res.data };
  } catch (err) {
    if (err instanceof EfiPixClientError) throw err;
    const status = err.response && err.response.status;
    const detail = err.response && err.response.data;
    logger.error('efi_pix_webhook_put_failed', {
      category: 'operational_error',
      component: 'efiPixClient',
      httpStatus: status || null,
      message: err.message,
      detail: detail ? JSON.stringify(detail).slice(0, 500) : null,
    });
    throw new EfiPixClientError(
      'EFI_WEBHOOK_PUT_FAILED',
      'Falha ao cadastrar webhook Pix na Efí',
      status && status < 500 ? status : 502,
    );
  }
}

/**
 * GET /v2/cob/:txid — consulta cobrança imediata (escopo cob.read).
 * Não cria cobrança. Retorna `null` se a Efí responder 404 (txid inexistente no PSP).
 *
 * @param {string} txid
 * @returns {Promise<object|null>}
 */
async function getCobByTxid(txid) {
  if (!isEfiPixConfigured()) {
    throw new EfiPixClientError('EFI_NOT_CONFIGURED', 'Integração Efí Pix não configurada', 503);
  }
  if (isProductionEfiEnv() && !isProductionPixExplicitlyEnabled()) {
    throw new EfiPixClientError(
      'EFI_PRODUCTION_NOT_ENABLED',
      'Produção Efí exige EFI_PIX_ENABLE_PRODUCTION=true',
      403,
    );
  }
  const t = String(txid || '').trim();
  if (!t) {
    throw new EfiPixClientError('EFI_TXID_REQUIRED', 'txid obrigatório', 400);
  }
  const httpsAgent = buildHttpsAgent();
  const baseUrl = getBaseUrl();
  const token = await fetchAccessToken(httpsAgent, baseUrl);
  const url = `${baseUrl}/v2/cob/${encodeURIComponent(t)}`;
  try {
    const res = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      httpsAgent,
      timeout: 45000,
    });
    return res.data && typeof res.data === 'object' ? res.data : null;
  } catch (err) {
    const status = err.response && err.response.status;
    if (status === 404) {
      return null;
    }
    logger.error('efi_pix_cob_get_failed', {
      category: 'operational_error',
      component: 'efiPixClient',
      txid: t,
      httpStatus: status || null,
      message: err.message,
    });
    throw new EfiPixClientError(
      'EFI_COB_GET_FAILED',
      'Falha ao consultar cobrança Pix na Efí',
      status && status < 500 ? status : 502,
    );
  }
}

/**
 * GET /v2/pix?inicio=&fim=&txid= — lista Pix recebidos (escopo pix.read).
 * `inicio` e `fim` em ISO 8601 (UTC).
 *
 * @param {{ inicioIso: string, fimIso: string, txid?: string }} params
 * @returns {Promise<object>}
 */
async function listPixReceived(params) {
  if (!isEfiPixConfigured()) {
    throw new EfiPixClientError('EFI_NOT_CONFIGURED', 'Integração Efí Pix não configurada', 503);
  }
  if (isProductionEfiEnv() && !isProductionPixExplicitlyEnabled()) {
    throw new EfiPixClientError(
      'EFI_PRODUCTION_NOT_ENABLED',
      'Produção Efí exige EFI_PIX_ENABLE_PRODUCTION=true',
      403,
    );
  }
  const inicioIso = String(params.inicioIso || '').trim();
  const fimIso = String(params.fimIso || '').trim();
  if (!inicioIso || !fimIso) {
    throw new EfiPixClientError('EFI_PIX_LIST_RANGE', 'inicioIso e fimIso são obrigatórios', 400);
  }
  const httpsAgent = buildHttpsAgent();
  const baseUrl = getBaseUrl();
  const token = await fetchAccessToken(httpsAgent, baseUrl);
  const q = new URLSearchParams({ inicio: inicioIso, fim: fimIso });
  if (params.txid) {
    q.append('txid', String(params.txid).trim());
  }
  const url = `${baseUrl}/v2/pix?${q.toString()}`;
  try {
    const res = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      httpsAgent,
      timeout: 45000,
    });
    return res.data && typeof res.data === 'object' ? res.data : { pix: [] };
  } catch (err) {
    const status = err.response && err.response.status;
    logger.error('efi_pix_received_list_failed', {
      category: 'operational_error',
      component: 'efiPixClient',
      httpStatus: status || null,
      message: err.message,
    });
    throw new EfiPixClientError(
      'EFI_PIX_LIST_FAILED',
      'Falha ao listar Pix recebidos na Efí',
      status && status < 500 ? status : 502,
    );
  }
}

/** GET /v2/webhook/:chave — consulta webhook (escopo webhook.read). */
function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * POST /v2/gn/relatorios/extrato-conciliacao — solicita extrato de conciliação (CSV).
 * Requer escopo `gn.reports.write` na aplicação Efí.
 *
 * @param {{ dataMovimento: string, tipoRegistros?: object }} params — dataMovimento `YYYY-MM-DD` (fuso conforme doc Efí / movimento diário)
 * @returns {Promise<object>} corpo JSON com `id`, `status`, etc.
 */
async function postExtratoConciliacao(params) {
  if (!isEfiPixConfigured()) {
    throw new EfiPixClientError('EFI_NOT_CONFIGURED', 'Integração Efí Pix não configurada', 503);
  }
  if (isProductionEfiEnv() && !isProductionPixExplicitlyEnabled()) {
    throw new EfiPixClientError(
      'EFI_PRODUCTION_NOT_ENABLED',
      'Produção Efí exige EFI_PIX_ENABLE_PRODUCTION=true',
      403,
    );
  }

  const dataMovimento = String(params.dataMovimento || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataMovimento)) {
    throw new EfiPixClientError('EFI_EXTRATO_DATE_INVALID', 'dataMovimento deve estar no formato YYYY-MM-DD', 400);
  }

  const tipoRegistros = params.tipoRegistros || {
    pixRecebido: true,
    tarifaPixRecebido: true,
    pixEnviadoChave: false,
    pixEnviadoDadosBancarios: false,
    estornoPixEnviado: false,
    pixDevolucaoEnviada: false,
    pixDevolucaoRecebida: false,
    tarifaPixEnviado: false,
    estornoTarifaPixEnviado: false,
    saldoDiaAnterior: false,
    saldoDia: false,
    transferenciaEnviada: false,
    transferenciaRecebida: false,
    estornoTransferenciaEnviada: false,
    tarifaTransferenciaEnviada: false,
    estornoTarifaTransferenciaEnviada: false,
    estornoTarifaPixRecebido: false,
  };

  const httpsAgent = buildHttpsAgent();
  const baseUrl = getBaseUrl();
  const token = await fetchAccessToken(httpsAgent, baseUrl);
  const url = `${baseUrl}/v2/gn/relatorios/extrato-conciliacao`;
  try {
    const res = await axios.post(
      url,
      { dataMovimento, tipoRegistros },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        httpsAgent,
        timeout: 45000,
      },
    );
    return res.data && typeof res.data === 'object' ? res.data : {};
  } catch (err) {
    if (err instanceof EfiPixClientError) throw err;
    const status = err.response && err.response.status;
    const detail = err.response && err.response.data;
    logger.error('efi_extrato_conciliacao_post_failed', {
      category: 'operational_error',
      component: 'efiPixClient',
      httpStatus: status || null,
      message: err.message,
      detail: detail ? JSON.stringify(detail).slice(0, 500) : null,
    });
    throw new EfiPixClientError(
      'EFI_EXTRATO_POST_FAILED',
      'Falha ao solicitar extrato de conciliação na Efí (verifique escopos gn.reports.write / produção)',
      status && status < 500 ? status : 502,
    );
  }
}

/**
 * GET /v2/gn/relatorios/:id — download do extrato (CSV) ou status de processamento (202 + JSON).
 * Requer escopo `gn.reports.read` na aplicação Efí.
 *
 * @param {string} id
 * @param {{ maxWaitMs?: number, pollMs?: number }} [opts]
 * @returns {Promise<{ ok: boolean, status: number, csv?: string, json?: object, code?: string }>}
 */
async function downloadRelatorioById(id, opts = {}) {
  if (!isEfiPixConfigured()) {
    throw new EfiPixClientError('EFI_NOT_CONFIGURED', 'Integração Efí Pix não configurada', 503);
  }
  if (isProductionEfiEnv() && !isProductionPixExplicitlyEnabled()) {
    throw new EfiPixClientError(
      'EFI_PRODUCTION_NOT_ENABLED',
      'Produção Efí exige EFI_PIX_ENABLE_PRODUCTION=true',
      403,
    );
  }

  const rid = String(id || '').trim();
  if (!rid) {
    throw new EfiPixClientError('EFI_RELATORIO_ID_REQUIRED', 'id do relatório obrigatório', 400);
  }

  const maxWaitMs = opts.maxWaitMs != null ? Number(opts.maxWaitMs) : 120000;
  const pollMs = opts.pollMs != null ? Number(opts.pollMs) : 5000;

  const httpsAgent = buildHttpsAgent();
  const baseUrl = getBaseUrl();
  const token = await fetchAccessToken(httpsAgent, baseUrl);
  const url = `${baseUrl}/v2/gn/relatorios/${encodeURIComponent(rid)}`;

  let waitedMs = 0;
  while (waitedMs <= maxWaitMs) {
    // eslint-disable-next-line no-await-in-loop
    const res = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      httpsAgent,
      timeout: 45000,
      responseType: 'text',
      transformResponse: [(body) => body],
      validateStatus: () => true,
    });

    if (res.status === 200) {
      const body = res.data;
      const text = typeof body === 'string' ? body : String(body || '');
      if (text.includes(';') && text.split('\n').some((l) => String(l).trim().startsWith('CA;'))) {
        return { ok: true, status: 200, csv: text };
      }
      // alguns ambientes podem retornar JSON em 200
      try {
        const j = JSON.parse(text);
        return { ok: false, status: 200, json: j, code: 'UNEXPECTED_JSON_BODY' };
      } catch (_) {
        return { ok: false, status: 200, code: 'UNEXPECTED_BODY' };
      }
    }

    if (res.status === 202) {
      const step = Number.isFinite(pollMs) && pollMs > 0 ? pollMs : 5000;
      if (waitedMs + step > maxWaitMs) {
        return { ok: false, status: 202, code: 'TIMEOUT_WAITING_CSV' };
      }
      // eslint-disable-next-line no-await-in-loop
      await sleep(step);
      waitedMs += step;
      // eslint-disable-next-line no-continue
      continue;
    }

    if (res.status === 404) {
      return { ok: false, status: 404, code: 'NOT_FOUND' };
    }

    logger.error('efi_relatorio_get_failed', {
      category: 'operational_error',
      component: 'efiPixClient',
      relatorioId: rid,
      httpStatus: res.status,
    });
    throw new EfiPixClientError(
      'EFI_RELATORIO_GET_FAILED',
      'Falha ao baixar relatório/extrato na Efí',
      res.status < 500 ? res.status : 502,
    );
  }

  return { ok: false, status: 202, code: 'TIMEOUT_WAITING_CSV' };
}

async function getPixWebhook() {
  if (!isEfiPixConfigured()) {
    throw new EfiPixClientError('EFI_NOT_CONFIGURED', 'Integração Efí Pix não configurada', 503);
  }
  if (isProductionEfiEnv() && !isProductionPixExplicitlyEnabled()) {
    throw new EfiPixClientError(
      'EFI_PRODUCTION_NOT_ENABLED',
      'Produção Efí exige EFI_PIX_ENABLE_PRODUCTION=true',
      403,
    );
  }
  const pixKey = String(process.env.EFI_PIX_KEY).trim();
  const httpsAgent = buildHttpsAgent();
  const baseUrl = getBaseUrl();
  const token = await fetchAccessToken(httpsAgent, baseUrl);
  const pathKey = encodeURIComponent(pixKey);
  const url = `${baseUrl}/v2/webhook/${pathKey}`;
  const skipMtls = String(process.env.EFI_PIX_WEBHOOK_SKIP_MTLS || 'true').toLowerCase() === 'true';
  const headers = {
    Authorization: `Bearer ${token}`,
  };
  if (skipMtls) {
    headers['x-skip-mtls-checking'] = 'true';
  }
  try {
    const res = await axios.get(url, {
      headers,
      httpsAgent,
      timeout: 45000,
    });
    return { httpStatus: res.status, data: res.data };
  } catch (err) {
    if (err instanceof EfiPixClientError) throw err;
    const status = err.response && err.response.status;
    const detail = err.response && err.response.data;
    logger.error('efi_pix_webhook_get_failed', {
      category: 'operational_error',
      component: 'efiPixClient',
      httpStatus: status || null,
      message: err.message,
      detail: detail ? JSON.stringify(detail).slice(0, 500) : null,
    });
    throw new EfiPixClientError(
      'EFI_WEBHOOK_GET_FAILED',
      'Falha ao consultar webhook Pix na Efí',
      status && status < 500 ? status : 502,
    );
  }
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
  getCobByTxid,
  listPixReceived,
  putPixWebhook,
  getPixWebhook,
  postExtratoConciliacao,
  downloadRelatorioById,
};
