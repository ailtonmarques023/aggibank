'use strict';

const express = require('express');
const accountApplicationService = require('../services/accountApplicationService');
const onboardingSessionService = require('../services/onboardingSessionService');
const {
  requireOnboardingApplicationEnabled,
  requireOnboardingProposalToken,
} = require('../middleware/onboardingAuth');
const { requireOnboardingSession } = require('../middleware/requireOnboardingSession');
const {
  setOnboardingSessionCookie,
  clearOnboardingSessionCookie,
} = require('../utils/onboardingCookie');
const logger = require('../utils/logger');

const router = express.Router();

router.use(requireOnboardingApplicationEnabled);

function sendError(req, res, err) {
  if (err && err.statusCode && err.code) {
    return res.status(err.statusCode).json({
      success: false,
      code: err.code,
      message: err.message,
      category: 'contract_error',
    });
  }

  logger.error('onboarding_route_error', {
    requestId: req.requestId,
    category: 'operational_error',
    message: err && err.message ? err.message : String(err),
  });

  return res.status(500).json({
    success: false,
    code: 'INTERNAL_ERROR',
    message: 'Não foi possível processar a proposta de abertura no momento.',
    category: 'operational_error',
  });
}

/**
 * POST /api/onboarding/applications
 * Cria proposta DRAFT + sessão HTTP-only (sem token no JSON).
 */
router.post('/applications', async (req, res) => {
  try {
    const { application } = await accountApplicationService.createApplication();
    const { cookieValue } = await onboardingSessionService.createOnboardingSession(
      application.applicationId,
      {
        userAgent: req.get('User-Agent'),
        ip: req.ip,
      }
    );

    setOnboardingSessionCookie(res, cookieValue);

    return res.status(201).json({
      success: true,
      data: {
        applicationId: application.applicationId,
        protocolNumber: application.protocolNumber,
        status: application.status,
        nextStep: onboardingSessionService.deriveNextStep(application.status),
        progress: application.progress,
        applicationExpiresAt: application.applicationExpiresAt,
      },
    });
  } catch (err) {
    return sendError(req, res, err);
  }
});

/**
 * GET /api/onboarding/applications/current/status
 * Requer cookie agilbank_onboarding_session (não JWT).
 */
router.get('/applications/current/status', requireOnboardingSession, async (req, res) => {
  try {
    const statusPayload = await accountApplicationService.getApplicationStatusForSession(
      req.onboardingApplication
    );

    return res.json({
      success: true,
      data: {
        ...statusPayload,
        nextStep: onboardingSessionService.deriveNextStep(statusPayload.status),
      },
    });
  } catch (err) {
    return sendError(req, res, err);
  }
});

/**
 * POST /api/onboarding/logout
 * Revoga sessão e limpa cookie.
 */
router.post('/logout', requireOnboardingSession, async (req, res) => {
  try {
    await onboardingSessionService.revokeOnboardingSession(req.onboardingSession.id);
    clearOnboardingSessionCookie(res);

    return res.json({
      success: true,
      data: { loggedOut: true },
    });
  } catch (err) {
    return sendError(req, res, err);
  }
});

/**
 * GET /api/onboarding/applications/:id/status
 * Legado F1 — X-Onboarding-Token (migração gradual).
 */
router.get('/applications/:id/status', requireOnboardingProposalToken, async (req, res) => {
  try {
    const applicationId = String(req.params.id || '').trim();
    if (!applicationId) {
      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'Identificador da proposta é obrigatório.',
        category: 'contract_error',
      });
    }

    const statusPayload = await accountApplicationService.getApplicationStatus(
      applicationId,
      req.onboardingTokenHash
    );

    return res.json({
      success: true,
      data: statusPayload,
    });
  } catch (err) {
    return sendError(req, res, err);
  }
});

module.exports = router;
