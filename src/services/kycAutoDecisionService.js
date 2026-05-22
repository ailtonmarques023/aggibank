'use strict';

/**
 * Motor conservador de decisão automática KYC (Fatia 1).
 * Default: flag desligada + shadow — não altera produção até habilitação explícita.
 */

const { prisma } = require('../config/database');
const { recordAudit } = require('../utils/auditLog');
const { isValidCpf } = require('../utils/cpfValidation');
const identityService = require('./identityService');
const identityStorage = require('./identityStorageService');
const internalIdentity = require('./internalIdentityService');

const AUTO_ACTOR_TYPE = 'KYC_AUTO_DECISION';
const AUTO_ACTOR_ID = 'auto:v1';

const TERMINAL_STATUSES = Object.freeze(['APPROVED', 'REJECTED', 'RESUBMISSION_REQUIRED']);

/** Recomendações permitidas na v1 (REJECTED automático proibido). */
const ALLOWED_RECOMMENDATIONS = Object.freeze([
  'APPROVED',
  'UNDER_MANUAL_REVIEW',
  'RESUBMISSION_REQUIRED',
  'SKIPPED',
]);

function isAutoDecisionEnabled() {
  return String(process.env.FEATURE_KYC_AUTO_DECISION_ENABLED || '').toLowerCase().trim() === 'true';
}

function isAutoDecisionShadow() {
  return String(process.env.FEATURE_KYC_AUTO_DECISION_SHADOW || 'true').toLowerCase().trim() !== 'false';
}

function rejectLookbackDays() {
  const raw = parseInt(process.env.KYC_AUTO_DECISION_REJECT_LOOKBACK_DAYS, 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 90;
}

/**
 * @param {import('@prisma/client').IdentitySubmissionArtifact} art
 * @returns {string | null}
 */
function detectArtifactAnomaly(art) {
  if (!art) return null;
  if (art.uploadStatus === 'QUARANTINED') return 'ARTIFACT_QUARANTINED';
  if (art.uploadStatus !== 'UPLOAD_CONFIRMED') return null;

  const type = String(art.type);
  const mime = art.mimeType ? String(art.mimeType).trim() : '';
  if (!mime) return 'ARTIFACT_MISSING_MIME';

  const mimeCheck = identityStorage.validateAllowedMimeType(type, mime);
  if (!mimeCheck.valid) return 'ARTIFACT_MIME_NOT_ALLOWED';

  const size = art.byteSize != null ? Number(art.byteSize) : null;
  if (size == null || !Number.isFinite(size) || size <= 0) return 'ARTIFACT_INVALID_SIZE';

  const sizeCheck = identityStorage.validateMaxFileSize(type, size);
  if (!sizeCheck.valid) return 'ARTIFACT_SIZE_OUT_OF_RANGE';

  return null;
}

/**
 * Avalia regras sem efeitos colaterais.
 * @param {{
 *   submission: object,
 *   artifacts: object[],
 *   user: object,
 *   recentNegativeDecisions: number,
 * }} ctx
 */
function computeRuleEvaluation(ctx) {
  const ruleHits = [];
  const requiredTypes = identityService.getRequiredArtifactTypes();
  const confirmed = ctx.artifacts.filter((a) => a.uploadStatus === 'UPLOAD_CONFIRMED');
  const confirmedTypes = new Set(confirmed.map((a) => String(a.type)));

  if (String(ctx.submission.status) !== 'READY_FOR_REVIEW') {
    ruleHits.push('STATUS_NOT_READY_FOR_REVIEW');
  }

  const missingRequired = requiredTypes.filter((t) => !confirmedTypes.has(t));
  if (missingRequired.length > 0) {
    ruleHits.push('ARTIFACTS_INCOMPLETE');
  }

  const pendingRequired = ctx.artifacts.filter(
    (a) =>
      requiredTypes.includes(String(a.type)) &&
      a.uploadStatus !== 'UPLOAD_CONFIRMED' &&
      a.uploadStatus !== 'DELETED_AFTER_POLICY'
  );
  if (pendingRequired.length > 0) {
    ruleHits.push('ARTIFACTS_NOT_CONFIRMED');
  }

  if (identityService.isFaceVideoRequired() && !confirmedTypes.has('FACE_VIDEO')) {
    ruleHits.push('FACE_VIDEO_REQUIRED_MISSING');
  }

  for (const art of ctx.artifacts) {
    if (!requiredTypes.includes(String(art.type))) continue;
    const anomaly = detectArtifactAnomaly(art);
    if (anomaly) ruleHits.push(anomaly);
  }

  if (!ctx.user.isVerificado) {
    ruleHits.push('EMAIL_NOT_VERIFIED');
  }

  if (!isValidCpf(ctx.user.cpf)) {
    ruleHits.push('CPF_INVALID');
  }

  if (ctx.submission.versionOrAttempt > 1) {
    ruleHits.push('MULTIPLE_ATTEMPTS');
  }

  if (ctx.recentNegativeDecisions > 0) {
    ruleHits.push('RECENT_NEGATIVE_DECISION');
  }

  let recommendation = 'APPROVED';
  if (ruleHits.includes('STATUS_NOT_READY_FOR_REVIEW')) {
    recommendation = 'SKIPPED';
  } else if (
    ruleHits.includes('ARTIFACTS_INCOMPLETE') ||
    ruleHits.includes('ARTIFACTS_NOT_CONFIRMED') ||
    ruleHits.includes('FACE_VIDEO_REQUIRED_MISSING')
  ) {
    recommendation = 'RESUBMISSION_REQUIRED';
  } else if (ruleHits.length > 0) {
    recommendation = 'UNDER_MANUAL_REVIEW';
  }

  const confirmedByType = {};
  for (const t of requiredTypes) {
    confirmedByType[t] = confirmedTypes.has(t) ? 1 : 0;
  }

  return {
    recommendation,
    ruleHits: [...new Set(ruleHits)],
    requiredArtifacts: requiredTypes,
    artifactCounts: {
      required: requiredTypes.length,
      confirmed: confirmed.length,
      byType: confirmedByType,
    },
    cpfValid: isValidCpf(ctx.user.cpf),
    emailVerified: Boolean(ctx.user.isVerificado),
    attemptsCount: ctx.submission.versionOrAttempt,
    recentNegativeDecisions: ctx.recentNegativeDecisions,
  };
}

/**
 * @param {object} evalResult
 * @param {{ shadow: boolean, enabled: boolean, applied: boolean }} meta
 */
function buildAuditMetadata(evalResult, meta) {
  return {
    outcome: evalResult.recommendation,
    ruleHits: evalResult.ruleHits,
    artifactCounts: evalResult.artifactCounts,
    cpfValid: evalResult.cpfValid,
    emailVerified: evalResult.emailVerified,
    attemptsCount: evalResult.attemptsCount,
    recentNegativeDecisions: evalResult.recentNegativeDecisions,
    shadow: meta.shadow,
    enabled: meta.enabled,
    applied: meta.applied,
  };
}

/**
 * @param {string} submissionId
 * @param {{ shadow?: boolean, enabled?: boolean, apply?: boolean, actorId?: string }} [options]
 */
async function evaluateSubmission(submissionId, options = {}) {
  const sid = String(submissionId || '').trim();
  if (!sid) {
    throw new Error('submissionId obrigatório');
  }

  const shadow = options.shadow !== undefined ? Boolean(options.shadow) : isAutoDecisionShadow();
  const enabled = options.enabled !== undefined ? Boolean(options.enabled) : isAutoDecisionEnabled();
  const shouldApply = options.apply !== undefined ? Boolean(options.apply) : enabled && !shadow;

  const submission = await prisma.identitySubmission.findUnique({
    where: { id: sid },
    include: { artifacts: true },
  });

  if (!submission) {
    const skipped = {
      recommendation: 'SKIPPED',
      ruleHits: ['SUBMISSION_NOT_FOUND'],
      artifactCounts: { required: 0, confirmed: 0, byType: {} },
      cpfValid: false,
      emailVerified: false,
      attemptsCount: 0,
      recentNegativeDecisions: 0,
    };
    await recordAudit({
      action: 'KYC_AUTO_DECISION',
      entity: 'IdentitySubmission',
      entityId: sid,
      metadata: buildAuditMetadata(skipped, { shadow, enabled, applied: false }),
    });
    return { ...skipped, applied: false, shadow, enabled };
  }

  if (TERMINAL_STATUSES.includes(submission.status) || submission.decidedAt != null) {
    const skipped = {
      recommendation: 'SKIPPED',
      ruleHits: ['ALREADY_DECIDED'],
      artifactCounts: { required: 0, confirmed: 0, byType: {} },
      cpfValid: false,
      emailVerified: false,
      attemptsCount: submission.versionOrAttempt,
      recentNegativeDecisions: 0,
    };
    await recordAudit({
      userId: submission.userId,
      action: 'KYC_AUTO_DECISION',
      entity: 'IdentitySubmission',
      entityId: sid,
      metadata: buildAuditMetadata(skipped, { shadow, enabled, applied: false }),
    });
    return { ...skipped, applied: false, shadow, enabled, submissionStatus: submission.status };
  }

  const user = await prisma.user.findUnique({
    where: { id: submission.userId },
    select: {
      id: true,
      isVerificado: true,
      cpf: true,
    },
  });

  if (!user) {
    const skipped = {
      recommendation: 'SKIPPED',
      ruleHits: ['USER_NOT_FOUND'],
      artifactCounts: { required: 0, confirmed: 0, byType: {} },
      cpfValid: false,
      emailVerified: false,
      attemptsCount: submission.versionOrAttempt,
      recentNegativeDecisions: 0,
    };
    await recordAudit({
      action: 'KYC_AUTO_DECISION',
      entity: 'IdentitySubmission',
      entityId: sid,
      metadata: buildAuditMetadata(skipped, { shadow, enabled, applied: false }),
    });
    return { ...skipped, applied: false, shadow, enabled, submissionStatus: submission.status };
  }

  const lookback = new Date();
  lookback.setDate(lookback.getDate() - rejectLookbackDays());

  const recentNegativeDecisions = await prisma.identitySubmission.count({
    where: {
      userId: user.id,
      status: { in: ['REJECTED', 'RESUBMISSION_REQUIRED'] },
      decidedAt: { gte: lookback },
      id: { not: sid },
    },
  });

  const evalResult = computeRuleEvaluation({
    submission,
    artifacts: submission.artifacts || [],
    user,
    recentNegativeDecisions,
  });

  if (!ALLOWED_RECOMMENDATIONS.includes(evalResult.recommendation)) {
    evalResult.recommendation = 'UNDER_MANUAL_REVIEW';
    evalResult.ruleHits.push('MOTOR_INCONCLUSIVE');
  }

  if (evalResult.recommendation === 'REJECTED') {
    throw new Error('REJECTED automático proibido na v1');
  }

  let applied = false;
  let submissionStatus = submission.status;

  if (shouldApply && evalResult.recommendation !== 'SKIPPED') {
    const actorId = String(options.actorId || AUTO_ACTOR_ID).trim().slice(0, 200) || AUTO_ACTOR_ID;

    if (evalResult.recommendation === 'APPROVED') {
      await internalIdentity.applySubmissionDecision({
        submissionId: sid,
        resolution: 'APPROVED',
        operatorReference: actorId,
        decisionActorType: AUTO_ACTOR_TYPE,
      });
      applied = true;
      submissionStatus = 'APPROVED';
    } else if (evalResult.recommendation === 'UNDER_MANUAL_REVIEW') {
      const moved = await internalIdentity.queueSubmissionForManualReview({
        submissionId: sid,
        actorReference: actorId,
        decisionActorType: AUTO_ACTOR_TYPE,
      });
      applied = moved.applied;
      if (moved.applied) submissionStatus = 'UNDER_MANUAL_REVIEW';
    } else if (evalResult.recommendation === 'RESUBMISSION_REQUIRED') {
      await internalIdentity.applySubmissionDecision({
        submissionId: sid,
        resolution: 'RESUBMISSION_REQUIRED',
        operatorReference: actorId,
        decisionActorType: AUTO_ACTOR_TYPE,
        internalReasonCode: 'MISSING_OR_UNCONFIRMED_ARTIFACTS',
        userFacingMessage:
          'Não foi possível concluir a análise automática. Reenvie todos os documentos obrigatórios e confirme cada upload.',
      });
      applied = true;
      submissionStatus = 'RESUBMISSION_REQUIRED';
    }
  }

  await recordAudit({
    userId: submission.userId,
    action: 'KYC_AUTO_DECISION',
    entity: 'IdentitySubmission',
    entityId: sid,
    metadata: buildAuditMetadata(evalResult, { shadow, enabled, applied }),
  });

  return {
    ...evalResult,
    applied,
    shadow,
    enabled,
    submissionStatus,
  };
}

module.exports = {
  AUTO_ACTOR_TYPE,
  AUTO_ACTOR_ID,
  ALLOWED_RECOMMENDATIONS,
  isAutoDecisionEnabled,
  isAutoDecisionShadow,
  computeRuleEvaluation,
  evaluateSubmission,
};
