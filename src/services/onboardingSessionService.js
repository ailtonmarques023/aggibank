'use strict';

const crypto = require('crypto');
const { prisma } = require('../config/database');
const accountApplicationService = require('./accountApplicationService');

function sessionHmacSecret() {
  return (
    process.env.ONBOARDING_SESSION_HMAC_SECRET ||
    process.env.ONBOARDING_TOKEN_HMAC_SECRET ||
    process.env.JWT_SECRET ||
    'change-me-onboarding-session-hmac'
  );
}

function sessionTtlMs() {
  const sec = parseInt(process.env.ONBOARDING_SESSION_MAX_AGE_SECONDS, 10);
  if (Number.isFinite(sec) && sec > 0) {
    return sec * 1000;
  }
  return 30 * 60 * 1000;
}

function httpError(statusCode, code, message) {
  const e = new Error(message);
  e.statusCode = statusCode;
  e.code = code;
  return e;
}

function hashSessionSecret(rawSecret) {
  return crypto
    .createHmac('sha256', sessionHmacSecret())
    .update(`onboarding-session:v1:${rawSecret}`)
    .digest('hex');
}

function generateSessionSecret() {
  return crypto.randomBytes(32).toString('base64url');
}

function hashOptionalContext(value, label) {
  if (value == null || String(value).trim() === '') return null;
  return crypto
    .createHmac('sha256', sessionHmacSecret())
    .update(`${label}:${String(value).trim()}`)
    .digest('hex')
    .slice(0, 32);
}

/**
 * @param {string} applicationId
 * @param {{ userAgent?: string, ip?: string }} [context]
 * @returns {Promise<{ cookieValue: string, session: object }>}
 */
async function createOnboardingSession(applicationId, context = {}) {
  const appId = String(applicationId || '').trim();
  if (!appId) {
    throw httpError(400, 'VALIDATION_ERROR', 'applicationId obrigatório');
  }

  const cookieValue = generateSessionSecret();
  const sessionHash = hashSessionSecret(cookieValue);
  const now = Date.now();
  const expiresAt = new Date(now + sessionTtlMs());

  const session = await prisma.onboardingSession.create({
    data: {
      applicationId: appId,
      sessionHash,
      status: 'ACTIVE',
      expiresAt,
      lastUsedAt: new Date(now),
      userAgentHash: hashOptionalContext(context.userAgent, 'ua'),
      ipHash: hashOptionalContext(context.ip, 'ip'),
    },
  });

  return { cookieValue, session };
}

/**
 * @param {string} cookieValue
 */
async function verifyOnboardingSessionCookie(cookieValue) {
  const raw = String(cookieValue || '').trim();
  if (!raw) {
    throw httpError(401, 'ONBOARDING_SESSION_REQUIRED', 'Sessão de proposta necessária.');
  }

  const sessionHash = hashSessionSecret(raw);
  const session = await prisma.onboardingSession.findUnique({
    where: { sessionHash },
    include: { application: true },
  });

  if (!session) {
    throw httpError(401, 'ONBOARDING_SESSION_INVALID', 'Sessão de proposta inválida.');
  }

  if (session.status !== 'ACTIVE') {
    throw httpError(401, 'ONBOARDING_SESSION_INACTIVE', 'Sessão de proposta encerrada.');
  }

  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.onboardingSession.update({
      where: { id: session.id },
      data: { status: 'EXPIRED' },
    });
    throw httpError(401, 'ONBOARDING_SESSION_EXPIRED', 'Sessão de proposta expirada.');
  }

  const application = await accountApplicationService.expireApplicationIfNeeded(session.application);

  await prisma.onboardingSession.update({
    where: { id: session.id },
    data: { lastUsedAt: new Date() },
  });

  return {
    applicationId: application.id,
    application,
    session: { ...session, application },
  };
}

async function revokeOnboardingSession(sessionId) {
  const id = String(sessionId || '').trim();
  if (!id) return null;
  return prisma.onboardingSession.update({
    where: { id },
    data: { status: 'REVOKED' },
  });
}

async function completeOnboardingSession(sessionId) {
  const id = String(sessionId || '').trim();
  if (!id) return null;
  return prisma.onboardingSession.update({
    where: { id },
    data: { status: 'COMPLETED' },
  });
}

function deriveNextStep(status) {
  const st = String(status || '');
  if (st === 'DRAFT' || st === 'DATA_RECEIVED') return 'PERSONAL_DATA';
  if (st === 'DOCUMENTS_PENDING' || st === 'RESUBMISSION_REQUIRED') return 'DOCUMENTS';
  if (st === 'DOCUMENTS_APPROVED' || st === 'READY_TO_FINALIZE') return 'TERMS_AND_FINALIZE';
  if (st === 'FINALIZED') return 'LOGIN';
  if (st === 'REJECTED' || st === 'CANCELLED' || st === 'EXPIRED') return 'RESTART';
  return 'STATUS';
}

module.exports = {
  hashSessionSecret,
  createOnboardingSession,
  verifyOnboardingSessionCookie,
  revokeOnboardingSession,
  completeOnboardingSession,
  deriveNextStep,
};
