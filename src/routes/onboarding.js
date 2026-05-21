'use strict';

const express = require('express');
const accountApplicationService = require('../services/accountApplicationService');
const {
  requireOnboardingApplicationEnabled,
  requireOnboardingProposalToken,
} = require('../middleware/onboardingAuth');
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
 * Cria proposta DRAFT + token temporário (corpo vazio na F1).
 */
router.post('/applications', async (req, res) => {
  try {
    const created = await accountApplicationService.createApplication();

    return res.status(201).json({
      success: true,
      data: {
        ...created.application,
        onboardingToken: created.onboardingToken,
      },
    });
  } catch (err) {
    return sendError(req, res, err);
  }
});

/**
 * GET /api/onboarding/applications/:id/status
 * Requer X-Onboarding-Token ou Bearer obt_* (não é sessão de usuário).
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
