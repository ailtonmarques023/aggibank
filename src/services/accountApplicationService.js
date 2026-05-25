'use strict';

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { prisma } = require('../config/database');

const TERMINAL_STATUSES = new Set(['FINALIZED', 'EXPIRED', 'CANCELLED']);
const PATCHABLE_APPLICATION_STATUSES = new Set(['DRAFT', 'DATA_RECEIVED', 'RESUBMISSION_REQUIRED']);

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
/**
 * Persiste dados da proposta (sem User/conta). Senha é hasheada no servidor.
 * @param {import('@prisma/client').AccountApplication} applicationRow
 * @param {object} payload
 */
async function updateApplicationFromSession(applicationRow, payload) {
  if (!applicationRow) {
    throw httpError(404, 'APPLICATION_NOT_FOUND', 'Proposta de abertura não encontrada.');
  }

  if (TERMINAL_STATUSES.has(applicationRow.status)) {
    throw httpError(409, 'APPLICATION_TERMINAL', 'Esta proposta não pode mais ser alterada.');
  }

  if (!PATCHABLE_APPLICATION_STATUSES.has(applicationRow.status)) {
    throw httpError(
      409,
      'APPLICATION_LOCKED',
      'Dados da proposta já foram enviados para verificação. Aguarde a análise ou use o login quando liberado.'
    );
  }

  const nomeCompleto = payload.nomeCompleto != null ? String(payload.nomeCompleto).trim() : null;
  const email = normalizeEmail(payload.email);
  const cpf = normalizeCpfDigits(payload.cpf);
  const telefone = payload.telefone != null ? String(payload.telefone).replace(/\D/g, '') : null;

  let dataNascimento = null;
  if (payload.dataNascimento) {
    const d = new Date(payload.dataNascimento);
    if (Number.isNaN(d.getTime())) {
      throw httpError(400, 'VALIDATION_ERROR', 'Data de nascimento inválida.');
    }
    dataNascimento = d;
  }

  let senhaHash = applicationRow.senhaHash;
  if (payload.senha != null && String(payload.senha).trim() !== '') {
    const senhaPlain = String(payload.senha);
    if (!/^\d{6}$/.test(senhaPlain)) {
      throw httpError(400, 'VALIDATION_ERROR', 'Senha deve ter 6 dígitos numéricos.');
    }
    const saltRounds = parseInt(process.env.BCRYPT_ROUNDS, 10) || 12;
    senhaHash = await bcrypt.hash(senhaPlain, saltRounds);
  }

  const enderecoJson = payload.endereco && typeof payload.endereco === 'object' ? payload.endereco : null;
  const dadosProfissionaisJson =
    payload.dadosProfissionais && typeof payload.dadosProfissionais === 'object'
      ? payload.dadosProfissionais
      : null;

  const draftRow = {
    ...applicationRow,
    nomeCompleto: nomeCompleto || applicationRow.nomeCompleto,
    email: email || applicationRow.email,
    cpf: cpf || applicationRow.cpf,
    telefone: telefone || applicationRow.telefone,
    dataNascimento: dataNascimento || applicationRow.dataNascimento,
    senhaHash,
    enderecoJson: enderecoJson || applicationRow.enderecoJson,
    dadosProfissionaisJson: dadosProfissionaisJson || applicationRow.dadosProfissionaisJson,
    aceitaComunicacoes:
      payload.aceitaComunicacoes === true || applicationRow.aceitaComunicacoes === true,
  };

  if (!hasPersonalDataComplete(draftRow)) {
    throw httpError(422, 'APPLICATION_DATA_INCOMPLETE', 'Complete os dados pessoais e a senha.');
  }
  if (!hasAddressComplete(draftRow.enderecoJson)) {
    throw httpError(422, 'APPLICATION_ADDRESS_INCOMPLETE', 'Informe o endereço completo.');
  }
  if (!hasProfessionalComplete(draftRow.dadosProfissionaisJson)) {
    throw httpError(422, 'APPLICATION_PROFESSIONAL_INCOMPLETE', 'Informe seus dados profissionais.');
  }

  if (payload.aceitaConsentimentoBiometrico !== true) {
    throw httpError(
      400,
      'BIOMETRIC_CONSENT_REQUIRED',
      'É necessário autorizar a verificação de segurança com documento, selfie e vídeo quando aplicável.'
    );
  }

  await noteDuplicateIdentifiers({ cpf: draftRow.cpf, email: draftRow.email });

  const nextStatus = applicationRow.status === 'DRAFT' ? 'DATA_RECEIVED' : applicationRow.status;

  const updated = await prisma.accountApplication.update({
    where: { id: applicationRow.id },
    data: {
      nomeCompleto: draftRow.nomeCompleto,
      email: draftRow.email,
      cpf: draftRow.cpf,
      telefone: draftRow.telefone,
      dataNascimento: draftRow.dataNascimento,
      senhaHash: draftRow.senhaHash,
      enderecoJson: draftRow.enderecoJson,
      dadosProfissionaisJson: draftRow.dadosProfissionaisJson,
      aceitaComunicacoes: draftRow.aceitaComunicacoes,
      aceitaTermos: false,
      status: nextStatus,
    },
  });

  return toPublicStatus(updated, { includeTokenExpiresAt: false });
}

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
      throw httpError(409, 'CPF_ALREADY_EXISTS', 'CPF já cadastrado. Faça login ou use outro CPF.');
    }
  }

  if (normalizedEmail) {
    const userByEmail = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });
    if (userByEmail) {
      throw httpError(409, 'EMAIL_ALREADY_EXISTS', 'E-mail já cadastrado. Faça login ou use outro e-mail.');
    }
  }

  return hints;
}

/** Status que impedem nova proposta linear (demais = não bloqueiam). */
const ACTIVE_APPLICATION_DEDUP_STATUSES = Object.freeze([
  'DRAFT',
  'DATA_RECEIVED',
  'DOCUMENTS_PENDING',
  'READY_TO_FINALIZE',
  'DOCUMENTS_APPROVED',
  'RESUBMISSION_REQUIRED',
]);

const ACTIVE_APPLICATION_DEDUP_MESSAGE =
  'Já existe uma proposta em andamento com este CPF ou e-mail. Aguarde a conclusão ou entre em contato com o suporte.';

/**
 * Bloqueia nova proposta quando CPF/e-mail já possuem User ou proposta ainda ativa (não expirada).
 */
async function noteActiveApplicationDuplicate({ cpf, email }) {
  await noteDuplicateIdentifiers({ cpf, email });

  const now = new Date();
  const normalizedCpf = normalizeCpfDigits(cpf);
  const normalizedEmail = normalizeEmail(email);
  const activeProposalWhere = {
    status: { in: [...ACTIVE_APPLICATION_DEDUP_STATUSES] },
    expiresAt: { gt: now },
  };

  if (normalizedCpf) {
    const activeByCpf = await prisma.accountApplication.findFirst({
      where: {
        cpf: normalizedCpf,
        ...activeProposalWhere,
      },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
    });
    if (activeByCpf) {
      throw httpError(409, 'APPLICATION_CPF_ACTIVE', ACTIVE_APPLICATION_DEDUP_MESSAGE);
    }
  }

  if (normalizedEmail) {
    const activeByEmail = await prisma.accountApplication.findFirst({
      where: {
        email: normalizedEmail,
        ...activeProposalWhere,
      },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
    });
    if (activeByEmail) {
      throw httpError(409, 'APPLICATION_EMAIL_ACTIVE', ACTIVE_APPLICATION_DEDUP_MESSAGE);
    }
  }

  return [];
}

module.exports = {
  isOnboardingApplicationEnabled,
  generateOnboardingToken,
  generateProtocolNumber,
  hashOnboardingToken,
  createApplication,
  getApplicationStatus,
  getApplicationStatusForSession,
  expireApplicationIfNeeded,
  noteDuplicateIdentifiers,
  noteActiveApplicationDuplicate,
  ACTIVE_APPLICATION_DEDUP_STATUSES,
  ACTIVE_APPLICATION_DEDUP_MESSAGE,
  updateApplicationFromSession,
  toPublicStatus,
  TERMINAL_STATUSES,
  PATCHABLE_APPLICATION_STATUSES,
  normalizeCpfDigits,
  normalizeEmail,
  hasPersonalDataComplete,
  hasAddressComplete,
  hasProfessionalComplete,
  httpError,
};
