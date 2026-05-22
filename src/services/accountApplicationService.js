'use strict';

const crypto = require('crypto');
const { prisma } = require('../config/database');

const TERMINAL_STATUSES = new Set(['FINALIZED', 'EXPIRED', 'CANCELLED']);

function isOnboardingApplicationEnabled() {
  return String(process.env.ONBOARDING_APPLICATION_ENABLED || '').toLowerCase().trim() === 'true';
}

function onboardingTokenTtlMs() {
  const sec = parseInt(process.env.ONBOARDING_TOKEN_TTL_SECONDS, 10);
  if (Number.isFinite(sec) && sec > 0) {
    return sec * 1000;
  }
  return 24 * 60 * 60 * 1000;
}

function applicationLifetimeMs() {
  const days = parseInt(process.env.ONBOARDING_APPLICATION_EXPIRES_DAYS, 10);
  if (Number.isFinite(days) && days > 0) {
    return days * 24 * 60 * 60 * 1000;
  }
  return 7 * 24 * 60 * 60 * 1000;
}

function httpError(statusCode, code, message) {
  const e = new Error(message);
  e.statusCode = statusCode;
  e.code = code;
  return e;
}

/** HMAC do token de proposta — nunca logar o valor em claro. */
function hashOnboardingToken(rawToken) {
  const secret =
    process.env.ONBOARDING_TOKEN_HMAC_SECRET ||
    process.env.JWT_SECRET ||
    'change-me-onboarding-hmac';
  return crypto.createHmac('sha256', secret).update(`onboarding:v1:${rawToken}`).digest('hex');
}

function generateOnboardingToken() {
  const body = crypto.randomBytes(32).toString('base64url');
  return `obt_${body}`;
}

function generateProtocolNumber() {
  const suffix = crypto.randomBytes(6).toString('hex').toUpperCase();
  return `APP-${suffix}`;
}

function normalizeCpfDigits(value) {
  if (value == null) return null;
  const digits = String(value).replace(/\D/g, '');
  return digits.length === 11 ? digits : null;
}

function normalizeEmail(value) {
  if (value == null) return null;
  const e = String(value).trim().toLowerCase();
  return e && e.includes('@') ? e : null;
}

function hasPersonalDataComplete(row) {
  return Boolean(
    row.nomeCompleto &&
      row.email &&
      row.cpf &&
      row.telefone &&
      row.dataNascimento &&
      row.senhaHash
  );
}

function hasAddressComplete(enderecoJson) {
  if (!enderecoJson || typeof enderecoJson !== 'object') return false;
  const e = enderecoJson;
  return Boolean(
    e.cep && e.logradouro && e.numero && e.bairro && e.cidade && e.estado
  );
}

function hasProfessionalComplete(dadosJson) {
  if (!dadosJson || typeof dadosJson !== 'object') return false;
  return Boolean(dadosJson.profissao);
}

function deriveProgress(row) {
  const personalDataComplete = hasPersonalDataComplete(row);
  const addressComplete = hasAddressComplete(row.enderecoJson);
  const professionalDataComplete = hasProfessionalComplete(row.dadosProfissionaisJson);
  const termsAccepted = row.aceitaTermos === true;
  const documentsComplete =
    row.status === 'DOCUMENTS_PENDING' ||
    row.status === 'DOCUMENTS_APPROVED' ||
    row.status === 'READY_TO_FINALIZE' ||
    row.status === 'FINALIZED';

  return {
    personalDataComplete,
    addressComplete,
    professionalDataComplete,
    termsAccepted,
    documentsComplete,
    readyToFinalize: row.status === 'DOCUMENTS_APPROVED',
  };
}

function toPublicStatus(row, { includeTokenExpiresAt = true } = {}) {
  const now = Date.now();
  const tokenExpired = row.tokenExpiresAt && row.tokenExpiresAt.getTime() < now;
  const applicationExpired = row.expiresAt && row.expiresAt.getTime() < now;

  return {
    applicationId: row.id,
    protocolNumber: row.protocolNumber,
    status: row.status,
    tokenExpired,
    applicationExpired,
    ...(includeTokenExpiresAt ? { tokenExpiresAt: row.tokenExpiresAt.toISOString() } : {}),
    applicationExpiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    progress: deriveProgress(row),
  };
}

async function expireApplicationIfNeeded(row) {
  if (!row || TERMINAL_STATUSES.has(row.status)) {
    return row;
  }
  const now = new Date();
  if (row.expiresAt > now) {
    return row;
  }
  return prisma.accountApplication.update({
    where: { id: row.id },
    data: { status: 'EXPIRED' },
  });
}

/**
 * Cria proposta DRAFT (sem User/conta). Token legado F1 fica só no banco; não é exposto na fatia cookie.
 */
async function createApplication() {
  const now = Date.now();
  const tokenExpiresAt = new Date(now + onboardingTokenTtlMs());
  const expiresAt = new Date(now + applicationLifetimeMs());
  const legacyToken = generateOnboardingToken();
  const tokenHash = hashOnboardingToken(legacyToken);

  const row = await prisma.accountApplication.create({
    data: {
      status: 'DRAFT',
      protocolNumber: generateProtocolNumber(),
      tokenHash,
      tokenExpiresAt,
      expiresAt,
    },
  });

  return {
    application: toPublicStatus(row, { includeTokenExpiresAt: false }),
  };
}

/**
 * Status público da proposta vinculada à sessão cookie (sem PII).
 */
async function getApplicationStatusForSession(applicationRow) {
  const current = await expireApplicationIfNeeded(applicationRow);
  return toPublicStatus(current, { includeTokenExpiresAt: false });
}

/**
 * Consulta status público da proposta (sem PII).
 */
async function getApplicationStatus(applicationId, tokenHash) {
  const row = await prisma.accountApplication.findUnique({
    where: { id: applicationId },
  });

  if (!row) {
    throw httpError(404, 'APPLICATION_NOT_FOUND', 'Proposta de abertura não encontrada.');
  }

  if (row.tokenHash !== tokenHash) {
    throw httpError(403, 'ONBOARDING_TOKEN_MISMATCH', 'Token inválido para esta proposta.');
  }

  if (row.tokenExpiresAt.getTime() < Date.now()) {
    throw httpError(401, 'ONBOARDING_TOKEN_EXPIRED', 'Token de proposta expirado. Inicie uma nova proposta.');
  }

  const current = await expireApplicationIfNeeded(row);
  return toPublicStatus(current);
}

/**
 * F1: validação leve de duplicidade — não bloqueia abertura definitiva (finalize em fatia futura).
 */
async function noteDuplicateIdentifiers({ cpf, email }) {
  const normalizedCpf = normalizeCpfDigits(cpf);
  const normalizedEmail = normalizeEmail(email);
  const hints = [];

  if (normalizedCpf) {
    const userByCpf = await prisma.user.findUnique({
      where: { cpf: normalizedCpf },
      select: { id: true },
    });
    if (userByCpf) {
      hints.push({ field: 'cpf', code: 'CPF_MAY_EXIST' });
    }
  }

  if (normalizedEmail) {
    const userByEmail = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });
    if (userByEmail) {
      hints.push({ field: 'email', code: 'EMAIL_MAY_EXIST' });
    }
  }

  return hints;
}

module.exports = {
  isOnboardingApplicationEnabled,
  hashOnboardingToken,
  createApplication,
  getApplicationStatus,
  getApplicationStatusForSession,
  expireApplicationIfNeeded,
  noteDuplicateIdentifiers,
  toPublicStatus,
  TERMINAL_STATUSES,
  normalizeCpfDigits,
  normalizeEmail,
  hasPersonalDataComplete,
  hasAddressComplete,
  hasProfessionalComplete,
  httpError,
};
