'use strict';

const { hashOnboardingToken, isOnboardingApplicationEnabled } = require('../services/accountApplicationService');

function sendDisabled(res) {
  return res.status(503).json({
    success: false,
    code: 'ONBOARDING_APPLICATION_DISABLED',
    message: 'Abertura de conta por proposta temporária não está disponível no momento.',
    category: 'operational_error',
  });
}

/** Feature flag global para rotas /api/onboarding. */
function requireOnboardingApplicationEnabled(req, res, next) {
  if (!isOnboardingApplicationEnabled()) {
    return sendDisabled(res);
  }
  return next();
}

function extractOnboardingToken(req) {
  const header = req.headers['x-onboarding-token'];
  if (header && String(header).trim()) {
    return String(header).trim();
  }
  const auth = req.headers.authorization;
  if (auth && /^Bearer\s+/i.test(auth)) {
    const t = auth.replace(/^Bearer\s+/i, '').trim();
    if (t.startsWith('obt_')) {
      return t;
    }
  }
  return null;
}

/**
 * Vincula token de proposta à aplicação :id (não é JWT de usuário / não acessa /api/me).
 */
function requireOnboardingProposalToken(req, res, next) {
  const token = extractOnboardingToken(req);
  if (!token) {
    return res.status(401).json({
      success: false,
      code: 'ONBOARDING_TOKEN_REQUIRED',
      message: 'Token de proposta de abertura necessário.',
      category: 'contract_error',
    });
  }

  req.onboardingToken = token;
  req.onboardingTokenHash = hashOnboardingToken(token);
  return next();
}

module.exports = {
  requireOnboardingApplicationEnabled,
  requireOnboardingProposalToken,
  extractOnboardingToken,
};
