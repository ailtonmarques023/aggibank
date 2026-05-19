'use strict';

const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const identityService = require('../services/identityService');
const { IdentityStorageDisabledError } = require('../services/identityStorageService');
const logger = require('../utils/logger');

const router = express.Router();

router.use(authenticateToken);

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
  logger.error('identity_kyc_route_error', {
    requestId: req.requestId,
    category: 'operational_error',
    message: error && error.message ? error.message : String(error),
    code: error && error.code ? error.code : 'INTERNAL_ERROR',
  });
  return sendError(res, 500, 'INTERNAL_ERROR', 'Erro interno do servidor');
}

function rejectBodyUserId(req, res) {
  if (req.body && Object.prototype.hasOwnProperty.call(req.body, 'userId')) {
    return sendError(
      res,
      400,
      'USER_ID_BODY_FORBIDDEN',
      'Não envie userId no corpo; a identificação vem exclusivamente do token.'
    );
  }
  return null;
}

router.get('/kyc-status', async (req, res) => {
  try {
    const data = await identityService.getKycStatus(req.user.id);
    return res.json({ success: true, data });
  } catch (error) {
    return handleRouteError(req, res, error);
  }
});

router.post('/kyc/presign', async (req, res) => {
  const forbidden = rejectBodyUserId(req, res);
  if (forbidden) return forbidden;

  try {
    const { artifactType, mimeType, byteSize } = req.body || {};
    const data = await identityService.presignUpload(req.user.id, {
      artifactType,
      mimeType,
      byteSize,
    });
    return res.json({ success: true, data });
  } catch (error) {
    return handleRouteError(req, res, error);
  }
});

router.post('/kyc/confirm-upload', async (req, res) => {
  const forbidden = rejectBodyUserId(req, res);
  if (forbidden) return forbidden;

  try {
    const { artifactId, checksumSHA256 } = req.body || {};
    const data = await identityService.confirmUpload(req.user.id, {
      artifactId,
      checksumSHA256,
    });
    return res.json({ success: true, data });
  } catch (error) {
    return handleRouteError(req, res, error);
  }
});

router.post('/kyc/submit', async (req, res) => {
  const forbidden = rejectBodyUserId(req, res);
  if (forbidden) return forbidden;

  try {
    const data = await identityService.submitForReview(req.user.id);
    return res.json({ success: true, data });
  } catch (error) {
    return handleRouteError(req, res, error);
  }
});

module.exports = router;
