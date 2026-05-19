'use strict';

const express = require('express');
const router = express.Router();

const { requireInternalApiKey } = require('../middleware/auth');
const internalIdentity = require('../services/internalIdentityService');
const { IdentityStorageDisabledError } = require('../services/identityStorageService');
const { recordAudit } = require('../utils/auditLog');

router.use(requireInternalApiKey('INTERNAL_KYC_KEY'));

/**
 * GET /api/internal/kyc/submissions
 * Lista submissões filtradas pelo status enum (status obrigatório na query).
 */
router.get('/submissions', async (req, res, next) => {
  try {
    const status = req.query.status;
    if (!status || String(status).trim() === '') {
      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'Query status é obrigatório',
      });
    }
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;
    const data = await internalIdentity.listSubmissionsByStatus({
      status: String(status),
      limit: Number.isFinite(limit) ? limit : 50,
      cursorCreatedAtIso: req.query.cursorCreatedAt ? String(req.query.cursorCreatedAt) : undefined,
      cursorId: req.query.cursorId ? String(req.query.cursorId) : undefined,
    });
    return res.json({ success: true, data });
  } catch (e) {
    if (e.name === 'ValidationError' && e.code === 'VALIDATION_ERROR') {
      return res.status(400).json({ success: false, code: e.code, message: e.message });
    }
    return next(e);
  }
});

/**
 * GET /api/internal/kyc/submissions/:id
 */
router.get('/submissions/:id', async (req, res, next) => {
  try {
    const row = await internalIdentity.getSubmissionDetailInternal(req.params.id);
    if (!row) {
      return res.status(404).json({
        success: false,
        code: 'NOT_FOUND',
        message: 'Submissão não encontrada',
      });
    }
    return res.json({ success: true, data: row });
  } catch (e) {
    return next(e);
  }
});

/**
 * POST /api/internal/kyc/submissions/:id/decision
 * Body:
 * - resolution: APPROVED | REJECTED | RESUBMISSION_REQUIRED
 * - operatorReference: obrigatório
 * - rejectReasonCode (ou reasonCode / internalReasonCode): obrigatório exceto APPROVED
 * - userFacingMessageSanitized (ou userFacingMessage): obrigatório exceto APPROVED
 */
router.post('/submissions/:id/decision', async (req, res, next) => {
  try {
    const body = req.body || {};
    const resolution = body.resolution;
    const operatorReference = body.operatorReference;
    const reasonCode =
      body.rejectReasonCode !== undefined ? body.rejectReasonCode : undefined;
    const legacyReason =
      body.reasonCode !== undefined ? body.reasonCode : body.internalReasonCode;
    const mergedReason =
      reasonCode !== undefined && reasonCode !== null && reasonCode !== ''
        ? reasonCode
        : legacyReason;
    const userMsg =
      body.userFacingMessageSanitized !== undefined
        ? body.userFacingMessageSanitized
        : body.userFacingMessage;

    const result = await internalIdentity.applySubmissionDecision({
      submissionId: req.params.id,
      resolution,
      operatorReference,
      internalReasonCode: mergedReason ?? null,
      userFacingMessage: userMsg ?? null,
    });

    await recordAudit({
      userId: result.submission && result.submission.userId,
      action: 'KYC_INTERNAL_DECISION',
      entity: 'IdentitySubmission',
      entityId: result.submission.id,
      metadata: {
        resolution: result.decision,
        reasonCodePresent: !!(result.submission.rejectReasonCode && String(result.submission.rejectReasonCode).trim()),
        publicMessageChars: result.submission.userFacingMessageSanitized
          ? result.submission.userFacingMessageSanitized.length
          : 0,
      },
      ip: req.ip ?? null,
      userAgent: req.get('User-Agent') ?? null,
    });

    return res.json({ success: true, data: result });
  } catch (e) {
    if (e.name === 'InvalidSubmissionStateError') {
      return res.status(409).json({
        success: false,
        code: e.code || 'INVALID_SUBMISSION_STATE',
        message: e.message,
      });
    }
    if (e.name === 'ValidationError') {
      const http = e.code === 'NOT_FOUND' ? 404 : 400;
      return res.status(http).json({
        success: false,
        code: e.code,
        message: e.message,
      });
    }
    return next(e);
  }
});

/**
 * POST /api/internal/kyc/artifacts/:artifactId/read-url
 * Retorna URL de leitura por tempo limitado; não registrar a URL nos logs das rotas.
 */
router.post('/artifacts/:artifactId/read-url', async (req, res, next) => {
  try {
    const data = await internalIdentity.createArtifactPresignedReadForInternal({
      artifactId: req.params.artifactId,
    });

    await recordAudit({
      action: 'KYC_ARTIFACT_READ_URL',
      entity: 'IdentitySubmissionArtifact',
      entityId: data.artifactId,
      metadata: {
        ttlSeconds: data.ttlSeconds,
        expiresAt: data.expiresAt,
      },
      ip: req.ip ?? null,
      userAgent: req.get('User-Agent') ?? null,
    });

    return res.json({ success: true, data });
  } catch (e) {
    if (e.name === 'IdentityStorageDisabledError') {
      return res.status(503).json({
        success: false,
        code: 'IDENTITY_STORAGE_DISABLED',
        message: 'Armazenamento KYC indisponível',
      });
    }
    if (e.name === 'ValidationError') {
      let http = 400;
      if (e.code === 'NOT_FOUND') http = 404;
      else if (e.code === 'IDENTITY_STORAGE_DISABLED') http = 503;
      return res.status(http).json({
        success: false,
        code: e.code,
        message: e.message,
      });
    }
    return next(e);
  }
});

module.exports = router;
