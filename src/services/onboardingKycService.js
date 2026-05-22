'use strict';

const crypto = require('crypto');
const { prisma } = require('../config/database');
const identityStorage = require('./identityStorageService');
const {
  getRequiredArtifactTypes,
  isFaceVideoRequired,
} = require('./identityService');
const { getPublicMessageForIdentityStatus } = require('../constants/kycPublicMessages');
const logger = require('../utils/logger');

const TERMINAL_APPLICATION_STATUSES = new Set(['FINALIZED', 'EXPIRED', 'CANCELLED']);

function httpError(statusCode, code, message) {
  const e = new Error(message);
  e.statusCode = statusCode;
  e.code = code;
  return e;
}

function generateArtifactIdOpaque() {
  return crypto.randomBytes(16).toString('hex');
}

function bucketFromEnv() {
  const b = String(process.env.KYC_STORAGE_BUCKET || '').trim();
  if (!b) {
    throw new identityStorage.IdentityStorageDisabledError(
      'KYC_STORAGE_BUCKET',
      'Bucket KYC não configurado.'
    );
  }
  return b;
}

/**
 * @param {import('@prisma/client').AccountApplication} applicationRow
 */
function assertApplicationWritable(applicationRow) {
  if (!applicationRow) {
    throw httpError(404, 'APPLICATION_NOT_FOUND', 'Proposta de abertura não encontrada.');
  }
  if (TERMINAL_APPLICATION_STATUSES.has(applicationRow.status)) {
    throw httpError(409, 'APPLICATION_TERMINAL', 'Esta proposta não aceita mais envio de documentos.');
  }
}

/**
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 * @param {string} accountApplicationId
 */
async function resolveWritableSubmission(tx, accountApplicationId) {
  const appId = String(accountApplicationId || '').trim();

  const locked = await tx.identitySubmission.findFirst({
    where: {
      accountApplicationId: appId,
      status: { in: ['READY_FOR_REVIEW', 'UNDER_MANUAL_REVIEW'] },
    },
    orderBy: { createdAt: 'desc' },
  });
  if (locked) {
    throw httpError(409, 'IDENTITY_LOCKED_WAITING_REVIEW', 'Documentos já enviados para análise.');
  }

  const approved = await tx.identitySubmission.findFirst({
    where: { accountApplicationId: appId, status: 'APPROVED' },
    orderBy: { createdAt: 'desc' },
  });
  if (approved) {
    throw httpError(409, 'IDENTITY_ALREADY_APPROVED', 'Identidade da proposta já aprovada.');
  }

  let work = await tx.identitySubmission.findFirst({
    where: {
      accountApplicationId: appId,
      status: { in: ['DRAFT', 'PENDING_UPLOADS'] },
    },
    orderBy: { createdAt: 'desc' },
    include: { artifacts: true },
  });

  if (work) return work;

  const prevCount = await tx.identitySubmission.count({
    where: { accountApplicationId: appId },
  });

  return tx.identitySubmission.create({
    data: {
      accountApplicationId: appId,
      status: 'DRAFT',
      versionOrAttempt: prevCount + 1,
    },
    include: { artifacts: true },
  });
}

/**
 * Status público KYC da proposta (sem PII, sem objectKey, sem signed URL).
 * @param {import('@prisma/client').AccountApplication} applicationRow
 */
async function getOnboardingKycStatus(applicationRow) {
  assertApplicationWritable(applicationRow);

  const appId = applicationRow.id;

  const writable = await prisma.identitySubmission.findFirst({
    where: { accountApplicationId: appId, status: { in: ['DRAFT', 'PENDING_UPLOADS'] } },
    orderBy: { createdAt: 'desc' },
    include: { artifacts: true },
  });

  const waitingReview = await prisma.identitySubmission.findFirst({
    where: {
      accountApplicationId: appId,
      status: { in: ['READY_FOR_REVIEW', 'UNDER_MANUAL_REVIEW'] },
    },
    orderBy: { createdAt: 'desc' },
    include: { artifacts: true },
  });

  let identityStatus = 'NOT_STARTED';
  let focal = writable || waitingReview;

  if (!focal) {
    const latestTerminal = await prisma.identitySubmission.findFirst({
      where: {
        accountApplicationId: appId,
        status: { in: ['APPROVED', 'REJECTED', 'RESUBMISSION_REQUIRED'] },
      },
      orderBy: { createdAt: 'desc' },
      include: { artifacts: true },
    });
    focal = latestTerminal || undefined;
  }

  if (focal) {
    identityStatus = focal.status;
  }

  const confirmedTypes =
    focal && Array.isArray(focal.artifacts)
      ? focal.artifacts.filter((a) => a.uploadStatus === 'UPLOAD_CONFIRMED').map((a) => a.type)
      : [];

  const uploadedSet = new Set(confirmedTypes);
  const requiredTypes = getRequiredArtifactTypes();
  const submittedArtifactsOrdered = requiredTypes.filter((t) => uploadedSet.has(t));
  const allConfirmed = requiredTypes.every((t) => uploadedSet.has(t));

  let canSubmitForReview = Boolean(
    focal &&
      (focal.status === 'DRAFT' || focal.status === 'PENDING_UPLOADS') &&
      allConfirmed
  );

  if (focal && (focal.status === 'READY_FOR_REVIEW' || focal.status === 'UNDER_MANUAL_REVIEW')) {
    canSubmitForReview = false;
  }

  const message = getPublicMessageForIdentityStatus(identityStatus, {
    allArtifactsConfirmed: allConfirmed,
  });

  const resubmissionMessage =
    focal &&
    (focal.status === 'RESUBMISSION_REQUIRED' || focal.status === 'REJECTED') &&
    focal.userFacingMessageSanitized
      ? focal.userFacingMessageSanitized
      : null;

  return {
    applicationId: appId,
    applicationStatus: applicationRow.status,
    identityStatus,
    requiredArtifacts: [...requiredTypes],
    submittedArtifacts: submittedArtifactsOrdered,
    canSubmitForReview,
    documentsComplete:
      applicationRow.status === 'DOCUMENTS_APPROVED' ||
      applicationRow.status === 'READY_TO_FINALIZE' ||
      allConfirmed,
    message: resubmissionMessage || message,
    ...(resubmissionMessage ? { resubmissionMessage } : {}),
  };
}

/**
 * @param {import('@prisma/client').AccountApplication} applicationRow
 * @param {{ artifactType: string, mimeType: string, byteSize: number }} input
 */
async function presignUpload(applicationRow, input) {
  assertApplicationWritable(applicationRow);

  if (!identityStorage.isIdentityStorageFeatureFlagOn()) {
    throw new identityStorage.IdentityStorageDisabledError(
      'FEATURE_KYC_DISABLED',
      'KYC desabilitado FEATURE_KYC_ENABLED=false'
    );
  }

  let artifactEnum;
  try {
    artifactEnum = identityStorage.normalizeArtifactType(input.artifactType);
  } catch (e) {
    throw httpError(400, 'VALIDATION_ERROR', e && e.message ? e.message : 'artifactType inválido');
  }

  const okMime = identityStorage.validateAllowedMimeType(artifactEnum, input.mimeType);
  if (!okMime.valid) {
    throw httpError(400, okMime.code, okMime.message);
  }

  const okSize = identityStorage.validateMaxFileSize(artifactEnum, input.byteSize);
  if (!okSize.valid) {
    throw httpError(400, okSize.code, okSize.message);
  }

  const bucket = bucketFromEnv();

  let shortExt;
  try {
    shortExt = identityStorage.extensionSegmentForMime(artifactEnum, okMime.mimeType);
  } catch (mapErr) {
    throw httpError(
      400,
      'MIME_NOT_MAPPED',
      mapErr && mapErr.message ? mapErr.message : 'Não foi possível mapear extensão para o MIME informado'
    );
  }

  const appId = applicationRow.id;
  /** @type {{ id: string, submissionId: string } | null} */
  let createdMeta = null;
  let isNewArtifactRow = false;

  await prisma.$transaction(async (tx) => {
    const submission = await resolveWritableSubmission(tx, appId);

    const existing = await tx.identitySubmissionArtifact.findFirst({
      where: { submissionId: submission.id, type: artifactEnum },
    });

    if (existing && existing.uploadStatus === 'UPLOAD_CONFIRMED') {
      throw httpError(
        409,
        'IDENTITY_ARTIFACT_ALREADY_CONFIRMED',
        'Este tipo de documento já foi confirmado.'
      );
    }

    const artifactId = existing?.id || generateArtifactIdOpaque();

    const objectKey = identityStorage.buildIdentityObjectKey({
      ownerScopeId: appId,
      submissionId: submission.id,
      artifactId,
      artifactType: artifactEnum,
      extension: shortExt,
    });

    let row;
    if (existing) {
      row = await tx.identitySubmissionArtifact.update({
        where: { id: existing.id },
        data: {
          bucket,
          objectKey,
          mimeType: okMime.mimeType,
          byteSize: input.byteSize,
          uploadStatus: 'AWAITING_UPLOAD',
          checksumSHA256: null,
        },
      });
    } else {
      isNewArtifactRow = true;
      row = await tx.identitySubmissionArtifact.create({
        data: {
          id: artifactId,
          submissionId: submission.id,
          type: artifactEnum,
          uploadStatus: 'AWAITING_UPLOAD',
          bucket,
          objectKey,
          mimeType: okMime.mimeType,
          byteSize: input.byteSize,
        },
      });
    }

    if (submission.status === 'DRAFT') {
      await tx.identitySubmission.update({
        where: { id: submission.id },
        data: { status: 'PENDING_UPLOADS' },
      });
    }

    createdMeta = {
      id: row.id,
      submissionId: submission.id,
    };
  });

  let signed;
  try {
    signed = await identityStorage.createPresignedUploadUrl({
      objectKey: identityStorage.buildIdentityObjectKey({
        ownerScopeId: appId,
        submissionId: createdMeta.submissionId,
        artifactId: createdMeta.id,
        artifactType: artifactEnum,
        extension: shortExt,
      }),
      mimeType: okMime.mimeType,
      byteSize: input.byteSize,
      artifactType: artifactEnum,
    });
  } catch (presignErr) {
    if (isNewArtifactRow) {
      await prisma.identitySubmissionArtifact.deleteMany({ where: { id: createdMeta.id } }).catch(() => {});
    }
    throw presignErr;
  }

  logger.info(
    {
      category: 'operational_audit',
      component: 'onboarding_kyc_service',
      op: 'onboarding_kyc_presign',
      applicationIdLen: appId.length,
      artifactIdLen: createdMeta.id.length,
    },
    'onboarding_kyc_presign_issued'
  );

  return {
    artifactId: createdMeta.id,
    uploadUrl: signed.url,
    headers: {
      'Content-Type': okMime.mimeType,
    },
    expiresAt: signed.expiresAt,
    ttlSeconds: signed.ttlSeconds,
  };
}

/**
 * @param {import('@prisma/client').AccountApplication} applicationRow
 * @param {{ artifactId: string, checksumSHA256?: string }} input
 */
async function confirmUpload(applicationRow, input) {
  assertApplicationWritable(applicationRow);

  const artifactId = String(input.artifactId || '').trim();
  if (!artifactId) {
    throw httpError(400, 'VALIDATION_ERROR', 'artifactId é obrigatório');
  }

  const art = await prisma.identitySubmissionArtifact.findFirst({
    where: { id: artifactId },
    include: { submission: true },
  });

  if (
    !art ||
    art.submission.accountApplicationId !== applicationRow.id ||
    art.submission.userId != null
  ) {
    throw httpError(403, 'ARTIFACT_ACCESS_DENIED', 'Artefato inválido ou não pertencente à proposta.');
  }

  if (art.uploadStatus !== 'AWAITING_UPLOAD') {
    return {
      artifactId: art.id,
      uploadStatus: art.uploadStatus,
      idempotent: true,
    };
  }

  if (!identityStorage.isIdentityStorageFeatureFlagOn()) {
    throw new identityStorage.IdentityStorageDisabledError(
      'FEATURE_KYC_DISABLED',
      'Confirmação de upload requer FEATURE_KYC_ENABLED=true e credenciais de armazenamento configuradas.'
    );
  }

  let headMeta;
  try {
    headMeta = await identityStorage.headIdentityObjectMetadata({
      bucket: art.bucket,
      objectKey: art.objectKey,
    });
  } catch (headErr) {
    if (headErr instanceof identityStorage.IdentityStorageDisabledError) {
      throw headErr;
    }
    if (headErr && headErr.code === 'UPLOAD_OBJECT_NOT_FOUND' && headErr.statusCode) {
      throw headErr;
    }
    throw httpError(
      502,
      'STORAGE_UNAVAILABLE',
      'Não foi possível validar o arquivo no armazenamento. Tente novamente em instantes.'
    );
  }

  const declaredSize = art.byteSize != null ? Number(art.byteSize) : null;
  const headLen = headMeta.contentLength !== undefined ? Number(headMeta.contentLength) : null;
  if (declaredSize != null) {
    if (headLen == null || Number.isNaN(headLen) || headLen !== declaredSize) {
      throw httpError(
        422,
        'UPLOAD_METADATA_MISMATCH',
        'O tamanho do arquivo não confere com o declarado. Refaça o upload e confirme novamente.'
      );
    }
  }

  const declaredMime = art.mimeType ? String(art.mimeType).trim().toLowerCase() : null;
  const headMime = identityStorage.normalizeContentTypeMeta(headMeta.contentType || null);
  if (declaredMime && headMime && declaredMime !== headMime) {
    throw httpError(
      422,
      'UPLOAD_METADATA_MISMATCH',
      'O tipo do arquivo não confere com o declarado. Refaça o upload conforme MIME escolhido no presign.'
    );
  }

  const updated = await prisma.identitySubmissionArtifact.update({
    where: { id: art.id },
    data: {
      uploadStatus: 'UPLOAD_CONFIRMED',
      ...(input.checksumSHA256 != null && String(input.checksumSHA256).trim() !== ''
        ? { checksumSHA256: String(input.checksumSHA256).trim().slice(0, 512) }
        : {}),
    },
  });

  return {
    artifactId: updated.id,
    uploadStatus: updated.uploadStatus,
    idempotent: false,
  };
}

/**
 * @param {import('@prisma/client').AccountApplication} applicationRow
 */
async function submitForReview(applicationRow) {
  assertApplicationWritable(applicationRow);
  const appId = applicationRow.id;

  const awaiting = await prisma.identitySubmission.findFirst({
    where: { accountApplicationId: appId, status: 'READY_FOR_REVIEW' },
    orderBy: { submittedForReviewAt: 'desc' },
    include: { artifacts: true },
  });

  if (awaiting) {
    return {
      identityStatus: awaiting.status,
      applicationStatus: applicationRow.status,
      idempotent: true,
    };
  }

  const txResult = await prisma.$transaction(async (tx) => {
    const sub = await tx.identitySubmission.findFirst({
      where: {
        accountApplicationId: appId,
        status: { in: ['DRAFT', 'PENDING_UPLOADS'] },
      },
      orderBy: { updatedAt: 'desc' },
      include: { artifacts: true },
    });

    if (!sub) {
      throw httpError(400, 'IDENTITY_SUBMIT_NO_ACTIVE', 'Não há envio ativo para concluir.');
    }

    const confirmed = sub.artifacts.filter((a) => a.uploadStatus === 'UPLOAD_CONFIRMED');
    const requiredTypes = getRequiredArtifactTypes();
    const ts = new Set(confirmed.map((a) => a.type));

    for (const reqT of requiredTypes) {
      if (!ts.has(reqT)) {
        const hint = isFaceVideoRequired()
          ? 'Envie e confira frente, verso do documento, selfie e vídeo facial; confirme cada upload antes de enviar.'
          : 'Envie e confira frente, verso do documento e selfie; confirme cada upload antes de enviar.';
        throw httpError(400, 'IDENTITY_MISSING_ARTIFACTS', hint);
      }
    }

    const updatedSubmission = await tx.identitySubmission.update({
      where: { id: sub.id },
      data: {
        status: 'READY_FOR_REVIEW',
        submittedForReviewAt: new Date(),
      },
    });

    const updatedApp = await tx.accountApplication.update({
      where: { id: appId },
      data: { status: 'DOCUMENTS_PENDING' },
    });

    return {
      identityStatus: updatedSubmission.status,
      applicationStatus: updatedApp.status,
      idempotent: false,
    };
  });

  logger.info(
    {
      category: 'operational_audit',
      component: 'onboarding_kyc_service',
      op: 'onboarding_kyc_submit',
      applicationIdLen: appId.length,
    },
    'onboarding_kyc_submitted_for_review'
  );

  return txResult;
}

module.exports = {
  getOnboardingKycStatus,
  presignUpload,
  confirmUpload,
  submitForReview,
};
