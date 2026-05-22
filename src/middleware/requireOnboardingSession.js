'use strict';

const { verifyOnboardingSessionCookie } = require('../services/onboardingSessionService');
const { readOnboardingSessionCookie } = require('../utils/onboardingCookie');

/**
 * Autentica apenas proposta temporária via cookie HTTP-only (não substitui JWT de usuário).
 */
async function requireOnboardingSession(req, res, next) {
  try {
    const cookieValue = readOnboardingSessionCookie(req);
    const verified = await verifyOnboardingSessionCookie(cookieValue);

    req.onboardingSession = verified.session;
    req.onboardingApplication = verified.application;
    req.onboardingApplicationId = verified.applicationId;

    return next();
  } catch (err) {
    if (err && err.statusCode && err.code) {
      return res.status(err.statusCode).json({
        success: false,
        code: err.code,
        message: err.message,
        category: 'contract_error',
      });
    }
    return next(err);
  }
}

module.exports = {
  requireOnboardingSession,
};
