'use strict';

/**
 * Operações internas de KYC (decisão manual, listagem para filas).
 * Não expõe objectKey nem PII pesada nos DTOs retornados.
 */

const crypto = require('crypto');
const { prisma } = require('../config/database');
const identityStorage = require('./identityStorageService');

/** Submissões a partir das quais a decisão manual é permitida (Fatia 7). */
const DECIDABLE_STATUSES = Object.freeze(['READY_FOR_REVIEW', 'UNDER_MANUAL_REVIEW']);

const LISTABLE_STATUSES = Object.freeze([
  'DRAFT',
  'PENDING_UPLOADS',
  'READY_FOR_REVIEW',
  'UNDER_MANUAL_REVIEW',
  'APPROVED',
  'REJECTED',
  'RESUBMISSION_REQUIRED',
]);

const LISTABLE_SET = new Set(LISTABLE_STATUSES);

const TERMINAL_STATUSES = Object.freeze(['APPROVED', 'REJECTED', 'RESUBMISSION_REQUIRED']);

/** @extends Error */
class InvalidSubmissionStateError extends Error {
  constructor(message = 'Submission não está em estado elegível para esta decisão') {
    super(message);
    this.name = 'InvalidSubmissionStateError';
    this.code = 'INVALID_SUBMISSION_STATE';
  }
}

/** @extends Error */
class ValidationError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message);
    this.name = 'ValidationError';
    this.code = code;
  }
}

/**
 * @param {string | undefined | null} raw
 * @returns {string}
 */
function sanitizeUserFacingMessage(raw) {
  let s = String(raw ?? '').replace(/\u0000/g, '');
  s = s.replace(/[<>]/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  if (s.length > 2000) s = s.slice(0, 2000);
  return s;
}

/**
 * @param {string | undefined | null} raw
 * @returns {string | null}
 */
function normalizeReasonCode(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const norm = s.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 64);
  return norm || null;
}

function artifactPublicShape(a) {
  const keyLen = String(a.objectKey || '').length;
  return {
    id: a.id,
    submissionId: a.submissionId,
    type: a.type,
    uploadStatus: a.uploadStatus,
    mimeType: a.mimeType ?? null,
    byteSize: a.byteSize ?? null,
    /** Sem objectKey nem URL; apenas metadados operacionais. */
    opaqueKeyLengthChars: keyLen,
    opaqueKeyFingerprint: keyLen
      ? crypto.createHash('sha256').update(String(a.objectKey)).digest('hex').slice(0, 16)
      : null,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}

function isProposalSubmission(row) {
  return Boolean(row && row.accountApplicationId && !row.userId);
}

/**
 * @param {'APPROVED' | 'REJECTED' | 'RESUBMISSION_REQUIRED'} resolution
 * @returns {'DOCUMENTS_APPROVED' | 'REJECTED' | 'RESUBMISSION_REQUIRED'}
 */
function mapResolutionToApplicationStatus(resolution) {
  if (resolution === 'APPROVED') return 'DOCUMENTS_APPROVED';
  if (resolution === 'REJECTED') return 'REJECTED';
  return 'RESUBMISSION_REQUIRED';
}

function submissionListItem(row) {
  const proposal = isProposalSubmission(row);
  return {
    id: row.id,
    userId: row.userId ?? null,
    accountApplicationId: row.accountApplicationId ?? null,
    ownerType: proposal ? 'PROPOSAL' : 'USER',
    status: row.status,
    versionOrAttempt: row.versionOrAttempt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    submittedForReviewAt: row.submittedForReviewAt ?? null,
    decidedAt: row.decidedAt ?? null,
    ...(proposal && row.accountApplication
      ? {
          applicationStatus: row.accountApplication.status,
          protocolNumber: row.accountApplication.protocolNumber,
        }
      : {}),
  };
}

function submissionDetail(row) {
  const proposal = isProposalSubmission(row);
  return {
    id: row.id,
    userId: row.userId ?? null,
    accountApplicationId: row.accountApplicationId ?? null,
    ownerType: proposal ? 'PROPOSAL' : 'USER',
    status: row.status,
    versionOrAttempt: row.versionOrAttempt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    submittedForReviewAt: row.submittedForReviewAt ?? null,
    decidedAt: row.decidedAt ?? null,
    decisionActorType: row.decisionActorType ?? null,
    decisionActorId: row.decisionActorId ?? null,
    rejectReasonCode: row.rejectReasonCode ?? null,
    userFacingMessageSanitized: row.userFacingMessageSanitized ?? null,
    ...(proposal && row.accountApplication
      ? {
          applicationStatus: row.accountApplication.status,
          protocolNumber: row.accountApplication.protocolNumber,
        }
      : {}),
    artifacts: (row.artifacts || []).map(artifactPublicShape),
  };
}

/**
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 * @param {import('@prisma/client').IdentitySubmission} sub
 * @param {'APPROVED' | 'REJECTED' | 'RESUBMISSION_REQUIRED'} resolution
 * @param {Date} now
 */
async function syncOwnerAfterIdentityDecision(tx, sub, resolution, now) {
  if (isProposalSubmission(sub)) {
    const appStatus = mapResolutionToApplicationStatus(resolution);
    await tx.accountApplication.update({
      where: { id: sub.accountApplicationId },
      data: { status: appStatus },
    });
    return;
  }

  if (!sub.userId) {
    throw new ValidationError('VALIDATION_ERROR', 'Submissão sem proprietário User ou proposta');
  }

  if (resolution === 'APPROVED') {
    await tx.user.update({
      where: { id: sub.userId },
      data: {
        identityReviewStatus: 'APPROVED',
        identityApprovedAt: now,
        lastIdentitySubmissionId: sub.id,
      },
    });
    return;
  }

  await tx.user.update({
    where: { id: sub.userId },
    data: {
      identityReviewStatus: 'REJECTED_RESUBMISSION',
      identityApprovedAt: null,
    },
  });
}

/**
 * @param {{ status: string, limit?: number, cursorCreatedAtIso?: string, cursorId?: string }}
 */
async function listSubmissionsByStatus({ status, limit = 50, cursorCreatedAtIso, cursorId }) {
  const st = String(status || '').trim();
  if (!LISTABLE_SET.has(st)) {
    throw new ValidationError('VALIDATION_ERROR', `status inválido ou não permitido para listagem: ${st}`);
  }
  const take = Math.min(Math.max(Number(limit) || 50, 1), 100);

  const where = { status: st };
  if (cursorCreatedAtIso && cursorId) {
    const d = new Date(cursorCreatedAtIso);
    if (!Number.isNaN(d.getTime())) {
      where.OR = [
        { createdAt: { lt: d } },
        { AND: [{ createdAt: d }, { id: { lt: cursorId } }] },
      ];
    }
  }

  const rows = await prisma.identitySubmission.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take,
    select: {
      id: true,
      userId: true,
      accountApplicationId: true,
      status: true,
      versionOrAttempt: true,
      createdAt: true,
      updatedAt: true,
      submittedForReviewAt: true,
      decidedAt: true,
      accountApplication: {
        select: {
          status: true,
          protocolNumber: true,
        },
      },
    },
  });

  return { items: rows.map(submissionListItem), limit: take };
}

/**
 * @param {string} id
 */
async function getSubmissionDetailInternal(id) {
  const row = await prisma.identitySubmission.findUnique({
    where: { id: String(id || '').trim() },
    include: {
      artifacts: true,
      accountApplication: {
        select: {
          status: true,
          protocolNumber: true,
        },
      },
    },
  });
  if (!row) return null;
  return submissionDetail(row);
}

/**
 * @param {{
 *  submissionId: string,
 *  resolution: 'APPROVED' | 'REJECTED' | 'RESUBMISSION_REQUIRED',
 *  operatorReference: string,
 *  internalReasonCode?: string | null,
 *  userFacingMessage?: string | null,
 * }}
 */
async function applySubmissionDecision({
  submissionId,
  resolution,
  operatorReference,
  internalReasonCode,
  userFacingMessage,
  decisionActorType,
}) {
  const sid = String(submissionId || '').trim();
  if (!sid) throw new ValidationError('VALIDATION_ERROR', 'submissionId obrigatório');

  const opRef = String(operatorReference || '').trim().slice(0, 200);
  if (!opRef) throw new ValidationError('VALIDATION_ERROR', 'operatorReference obrigatório');

  const actorType = String(decisionActorType || 'INTERNAL_KYC_OPERATOR').trim().slice(0, 64);

  const allowedRes = ['APPROVED', 'REJECTED', 'RESUBMISSION_REQUIRED'];
  if (!allowedRes.includes(resolution)) {
    throw new ValidationError('VALIDATION_ERROR', `resolution deve ser um de: ${allowedRes.join(', ')}`);
  }

  const sanitizedMsg = sanitizeUserFacingMessage(userFacingMessage);
  const reason = normalizeReasonCode(internalReasonCode);

  if (resolution !== 'APPROVED') {
    if (!reason) {
      throw new ValidationError(
        'VALIDATION_ERROR',
        'internalReasonCode (reasonCode) obrigatório para reprovação / reenvio'
      );
    }
    if (!sanitizedMsg) throw new ValidationError('VALIDATION_ERROR', 'userFacingMessage obrigatório após sanitização');
  }

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    const sub = await tx.identitySubmission.findUnique({ where: { id: sid } });
    if (!sub) throw new ValidationError('NOT_FOUND', 'Submissão não encontrada');

    if (!DECIDABLE_STATUSES.includes(sub.status) || sub.decidedAt != null) {
      throw new InvalidSubmissionStateError();
    }

    const lockWhere = {
      id: sid,
      status: { in: [...DECIDABLE_STATUSES] },
      decidedAt: null,
    };

    if (resolution === 'APPROVED') {
      const locked = await tx.identitySubmission.updateMany({
        where: lockWhere,
        data: {
          status: 'APPROVED',
          decidedAt: now,
          decisionActorType: actorType,
          decisionActorId: opRef,
          rejectReasonCode: null,
          userFacingMessageSanitized: null,
        },
      });
      if (locked.count === 0) throw new InvalidSubmissionStateError();

      await syncOwnerAfterIdentityDecision(tx, sub, 'APPROVED', now);
      return;
    }

    if (resolution === 'REJECTED') {
      const locked = await tx.identitySubmission.updateMany({
        where: lockWhere,
        data: {
          status: 'REJECTED',
          decidedAt: now,
          decisionActorType: actorType,
          decisionActorId: opRef,
          rejectReasonCode: reason,
          userFacingMessageSanitized: sanitizedMsg,
        },
      });
      if (locked.count === 0) throw new InvalidSubmissionStateError();

      await syncOwnerAfterIdentityDecision(tx, sub, 'REJECTED', now);
      return;
    }

    const locked = await tx.identitySubmission.updateMany({
      where: lockWhere,
      data: {
        status: 'RESUBMISSION_REQUIRED',
        decidedAt: now,
        decisionActorType: actorType,
        decisionActorId: opRef,
        rejectReasonCode: reason,
        userFacingMessageSanitized: sanitizedMsg,
      },
    });
    if (locked.count === 0) throw new InvalidSubmissionStateError();

    await syncOwnerAfterIdentityDecision(tx, sub, 'RESUBMISSION_REQUIRED', now);
  });

  const full = await getSubmissionDetailInternal(sid);
  const applicationStatus =
    full && full.accountApplicationId
      ? mapResolutionToApplicationStatus(resolution)
      : undefined;

  return {
    submission: full,
    decision: resolution,
    ...(applicationStatus ? { applicationStatus } : {}),
  };
}

/**
 * Fila manual: READY_FOR_REVIEW → UNDER_MANUAL_REVIEW (sem decidedAt).
 * Idempotente se já estiver em UNDER_MANUAL_REVIEW.
 * @param {{
 *  submissionId: string,
 *  actorReference: string,
 *  decisionActorType?: string,
 * }}
 */
async function queueSubmissionForManualReview({
  submissionId,
  actorReference,
  decisionActorType,
}) {
  const sid = String(submissionId || '').trim();
  if (!sid) throw new ValidationError('VALIDATION_ERROR', 'submissionId obrigatório');

  const opRef = String(actorReference || '').trim().slice(0, 200);
  if (!opRef) throw new ValidationError('VALIDATION_ERROR', 'actorReference obrigatório');

  const actorType = String(decisionActorType || 'KYC_AUTO_DECISION').trim().slice(0, 64);

  const sub = await prisma.identitySubmission.findUnique({ where: { id: sid } });
  if (!sub) throw new ValidationError('NOT_FOUND', 'Submissão não encontrada');

  if (TERMINAL_STATUSES.includes(sub.status) || sub.decidedAt != null) {
    return { applied: false, submission: await getSubmissionDetailInternal(sid), reason: 'ALREADY_DECIDED' };
  }

  if (sub.status === 'UNDER_MANUAL_REVIEW') {
    return { applied: false, submission: await getSubmissionDetailInternal(sid), reason: 'ALREADY_QUEUED' };
  }

  if (sub.status !== 'READY_FOR_REVIEW') {
    throw new InvalidSubmissionStateError('Submission não está em READY_FOR_REVIEW');
  }

  const moved = await prisma.identitySubmission.updateMany({
    where: { id: sid, status: 'READY_FOR_REVIEW', decidedAt: null },
    data: {
      status: 'UNDER_MANUAL_REVIEW',
      decisionActorType: actorType,
      decisionActorId: opRef,
    },
  });

  if (moved.count > 0 && isProposalSubmission(sub)) {
    await prisma.accountApplication.updateMany({
      where: {
        id: sub.accountApplicationId,
        status: { in: ['DOCUMENTS_PENDING', 'DATA_RECEIVED', 'DRAFT'] },
      },
      data: { status: 'DOCUMENTS_PENDING' },
    });
  }

  const full = await getSubmissionDetailInternal(sid);
  return { applied: moved.count > 0, submission: full, reason: moved.count > 0 ? 'QUEUED' : 'RACE_OR_STATE' };
}

/**
 * @param {string} artifactId
 * @returns {Promise<{ url: string, expiresAt: string, ttlSeconds: number, artifactId: string }>}
 */
async function createArtifactPresignedReadForInternal({ artifactId }) {
  const aid = String(artifactId || '').trim();
  if (!aid) throw new ValidationError('VALIDATION_ERROR', 'artifactId obrigatório');

  if (!identityStorage.isIdentityStorageFeatureFlagOn()) {
    throw new ValidationError(
      'IDENTITY_STORAGE_DISABLED',
      'Armazenamento KYC não habilitado (FEATURE_KYC_ENABLED)'
    );
  }

  const art = await prisma.identitySubmissionArtifact.findUnique({
    where: { id: aid },
    select: {
      id: true,
      objectKey: true,
      uploadStatus: true,
      submission: {
        select: {
          status: true,
        },
      },
    },
  });

  if (!art) throw new ValidationError('NOT_FOUND', 'Artefato não encontrado');

  if (String(art.uploadStatus) !== 'UPLOAD_CONFIRMED') {
    throw new ValidationError(
      'ARTIFACT_NOT_READABLE',
      'Artefato não está em estado CONFIRMADO para leitura'
    );
  }

  const out = await identityStorage.createPresignedReadUrl({
    objectKey: art.objectKey,
  });

  return {
    artifactId: art.id,
    url: out.url,
    expiresAt: out.expiresAt,
    ttlSeconds: out.ttlSeconds,
  };
}

module.exports = {
  InvalidSubmissionStateError,
  ValidationError,
  sanitizeUserFacingMessage,
  isProposalSubmission,
  mapResolutionToApplicationStatus,
  LISTABLE_STATUSES,
  DECIDABLE_STATUSES,
  listSubmissionsByStatus,
  getSubmissionDetailInternal,
  applySubmissionDecision,
  queueSubmissionForManualReview,
  createArtifactPresignedReadForInternal,
};
