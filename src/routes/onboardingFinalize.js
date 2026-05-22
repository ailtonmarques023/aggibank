'use strict';

const express = require('express');
const { requireOnboardingSession } = require('../middleware/requireOnboardingSession');
const onboardingFinalizeService = require('../services/onboardingFinalizeService');
const onboardingSessionService = require('../services/onboardingSessionService');
const { clearOnboardingSessionCookie } = require('../utils/onboardingCookie');
const { recordAudit } = require('../utils/auditLog');
const logger = require('../utils/logger');

const router = express.Router();

function sendError(res, err) {
  if (err && err.statusCode && err.code) {
    return res.status(err.statusCode).json({
      success: false,
      code: err.code,
      message: err.message,
      category: 'contract_error',
    });
  }
  logger.error('onboarding_finalize_route_error', {
    category: 'operational_error',
    message: err && err.message ? err.message : String(err),
  });
  return res.status(500).json({
    success: false,
    code: 'INTERNAL_ERROR',
    message: 'Não foi possível concluir a abertura no momento.',
    category: 'operational_error',
  });
}

/**
 * POST /api/onboarding/finalize
 * Cria User + conta real; não retorna JWT; limpa cookie de onboarding.
 */
router.post('/finalize', requireOnboardingSession, async (req, res) => {
  try {
    const body = req.body || {};
    const acceptedTerms = body.acceptedTerms === true;
    const acceptedPrivacyPolicy = body.acceptedPrivacyPolicy === true;

    const result = await onboardingFinalizeService.finalizeOnboardingApplication(
      req.onboardingApplication,
      { acceptedTerms, acceptedPrivacyPolicy },
      { sessionId: req.onboardingSession.id }
    );

    await onboardingSessionService.completeOnboardingSession(req.onboardingSession.id);
    clearOnboardingSessionCookie(res);

    await recordAudit({
      userId: result.userId || null,
      action: 'ONBOARDING_FINALIZE',
      entity: 'AccountApplication',
      entityId: req.onboardingApplicationId,
      metadata: {
        idempotent: result.idempotent,
        nextStep: result.nextStep,
        verificationEmailStatus: result.verificationEmail?.status || null,
      },
      ip: req.ip ?? null,
      userAgent: req.get('User-Agent') ?? null,
    });

    return res.status(200).json({
      success: true,
      message: result.message,
      data: {
        nextStep: result.nextStep,
        verificationEmail: result.verificationEmail,
      },
    });
  } catch (err) {
    if (err && err.code === 'P2002') {
      return res.status(409).json({
        success: false,
        code: 'REGISTER_DUPLICATE',
        message: 'Os dados informados já estão vinculados a uma conta. Faça login.',
        category: 'contract_error',
      });
    }
    return sendError(res, err);
  }
});

module.exports = router;
