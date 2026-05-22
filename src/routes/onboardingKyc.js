'use strict';

const express = require('express');
const onboardingKycService = require('../services/onboardingKycService');
const { requireOnboardingSession } = require('../middleware/requireOnboardingSession');
const { IdentityStorageDisabledError } = require('../services/identityStorageService');
const logger = require('../utils/logger');

const router = express.Router();

router.use(requireOnboardingSession);

function sendError(res, status, code, message) {
  return res.status(status).json({
    success: false,
    code,
    message,
    category: 'contract_error',
  });
}

function handleRouteError(req, res, error) {
  if (error instanceof IdentityStorageDisabledError) {
    return sendError(res, 503, error.code, error.message);
  }
  if (error && error.statusCode && error.code) {
    return sendError(res, error.statusCode, error.code, error.message);
  }
  logger.error('onboarding_kyc_route_error', {
    requestId: req.requestId,
    category: 'operational_error',
    message: error && error.message ? error.message : String(error),
    code: error && error.code ? error.code : 'INTERNAL_ERROR',
  });
  return sendError(res, 500, 'INTERNAL_ERROR', 'Não foi possível processar os documentos da proposta.');
}

function rejectBodyApplicationId(req, res) {
  if (req.body && Object.prototype.hasOwnProperty.call(req.body, 'applicationId')) {
    return sendError(
      res,
      400,
      'APPLICATION_ID_BODY_FORBIDDEN',
      'Não envie applicationId no corpo; a proposta vem da sessão de onboarding.'
    );
  }
  return null;
}

router.get('/status', async (req, res) => {
  try {
    const data = await onboardingKycService.getOnboardingKycStatus(req.onboardingApplication);
    return res.json({ success: true, data });
  } catch (error) {
    return handleRouteError(req, res, error);
  }
});

router.post('/presign', async (req, res) => {
  const forbidden = rejectBodyApplicationId(req, res);
  if (forbidden) return forbidden;

  try {
    const { artifactType, mimeType, byteSize } = req.body || {};
    const data = await onboardingKycService.presignUpload(req.onboardingApplication, {
      artifactType,
      mimeType,
      byteSize,
    });
    return res.json({ success: true, data });
  } catch (error) {
    return handleRouteError(req, res, error);
  }
});

router.post('/confirm-upload', async (req, res) => {
  const forbidden = rejectBodyApplicationId(req, res);
  if (forbidden) return forbidden;

  try {
    const { artifactId, checksumSHA256 } = req.body || {};
    const data = await onboardingKycService.confirmUpload(req.onboardingApplication, {
      artifactId,
      checksumSHA256,
    });
    return res.json({ success: true, data });
  } catch (error) {
    return handleRouteError(req, res, error);
  }
});

router.post('/submit', async (req, res) => {
  const forbidden = rejectBodyApplicationId(req, res);
  if (forbidden) return forbidden;

  try {
    const data = await onboardingKycService.submitForReview(req.onboardingApplication);
    return res.json({ success: true, data });
  } catch (error) {
    return handleRouteError(req, res, error);
  }
});

module.exports = router;
