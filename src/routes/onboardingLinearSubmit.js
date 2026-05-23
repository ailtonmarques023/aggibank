'use strict';

const express = require('express');
const multer = require('multer');
const identityStorage = require('../services/identityStorageService');
const {
  isOnboardingLinearSubmitEnabled,
  submitFullOnboardingApplication,
} = require('../services/onboardingLinearSubmitService');
const logger = require('../utils/logger');

const router = express.Router();

function requireLinearSubmitEnabled(req, res, next) {
  if (!isOnboardingLinearSubmitEnabled()) {
    return res.status(503).json({
      success: false,
      code: 'ONBOARDING_LINEAR_SUBMIT_DISABLED',
      message: 'Envio completo de proposta está indisponível no momento.',
      category: 'contract_error',
    });
  }
  return next();
}

const maxBytes = Math.max(
  identityStorage.getAllowedUploadMaxBytes(),
  identityStorage.getAllowedVideoUploadMaxBytes()
);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: maxBytes,
    files: 4,
    fieldSize: 64 * 1024,
  },
});

const uploadFields = upload.fields([
  { name: 'documentFront', maxCount: 1 },
  { name: 'documentBack', maxCount: 1 },
  { name: 'selfiePortrait', maxCount: 1 },
  { name: 'faceVideo', maxCount: 1 },
]);

function mapMulterFiles(files) {
  const out = {};
  if (!files) return out;
  for (const key of ['documentFront', 'documentBack', 'selfiePortrait', 'faceVideo']) {
    const arr = files[key];
    if (arr && arr[0]) {
      out[key] = arr[0];
    }
  }
  return out;
}

function sendError(req, res, err) {
  if (err && err.statusCode && err.code) {
    return res.status(err.statusCode).json({
      success: false,
      code: err.code,
      message: err.message,
      category: 'contract_error',
    });
  }

  if (err && err.name === 'MulterError') {
    const code = err.code === 'LIMIT_FILE_SIZE' ? 'SIZE_TOO_LARGE' : 'VALIDATION_ERROR';
    return res.status(400).json({
      success: false,
      code,
      message: 'Arquivo excede o tamanho permitido ou formato inválido.',
      category: 'contract_error',
    });
  }

  if (err instanceof identityStorage.IdentityStorageDisabledError) {
    return res.status(503).json({
      success: false,
      code: err.code,
      message: err.message,
      category: 'contract_error',
    });
  }

  logger.error('onboarding_linear_submit_route_error', {
    requestId: req.requestId,
    category: 'operational_error',
    message: err && err.message ? err.message : String(err),
  });

  return res.status(500).json({
    success: false,
    code: 'INTERNAL_ERROR',
    message: 'Não foi possível processar sua proposta no momento.',
    category: 'operational_error',
  });
}

/**
 * POST /api/onboarding/applications/submit-full
 * Proposta completa em uma requisição (sem cookie de sessão).
 */
router.post(
  '/applications/submit-full',
  requireLinearSubmitEnabled,
  (req, res, next) => {
    uploadFields(req, res, (err) => {
      if (err) return sendError(req, res, err);
      return next();
    });
  },
  async (req, res) => {
    try {
      const result = await submitFullOnboardingApplication({
        body: req.body,
        files: mapMulterFiles(req.files),
      });
      const statusCode = result.status === 'FINALIZED' ? 201 : 202;
      return res.status(statusCode).json(result);
    } catch (err) {
      return sendError(req, res, err);
    }
  }
);

module.exports = router;
