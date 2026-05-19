'use strict';

const crypto = require('crypto');
const { prisma } = require('../config/database');
const identityStorage = require('./identityStorageService');
const logger = require('../utils/logger');

const REQUIRED_ARTIFACT_TYPES = Object.freeze(['DOCUMENT_FRONT', 'DOCUMENT_BACK', 'SELFIE_PORTRAIT']);

function httpError(statusCode, code, message) {
  const e = new Error(message);
  e.statusCode = statusCode;
  e.code = code;
  return e;
}

/** @returns {string} */
function mimeToShortExt(normalizedMime) {
  switch (normalizedMime) {
    case 'image/jpeg':
      return 'jpeg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    default:
      return '';
  }
}

/** @returns {string} opaque id válido para objectKey segment */
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
 * Snapshot amigável do fluxo para GET /api/me/kyc-status.
 * @param {string} userId
 */
async function getKycStatus(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      isVerificado: true,
      identityReviewStatus: true,
      identityApprovedAt: true,
    },
  });

  if (!user) throw httpError(404, 'USER_NOT_FOUND', 'Usuário não encontrado');

  const writable = await prisma.identitySubmission.findFirst({
    where: { userId, status: { in: ['DRAFT', 'PENDING_UPLOADS'] } },
    orderBy: { createdAt: 'desc' },
    include: { artifacts: true },
  });

  const waitingReview = await prisma.identitySubmission.findFirst({
    where: { userId, status: { in: ['READY_FOR_REVIEW', 'UNDER_MANUAL_REVIEW'] } },
    orderBy: { createdAt: 'desc' },
    include: { artifacts: true },
  });

  /** @type {'NOT_STARTED' & string} */
  let identityStatus = 'NOT_STARTED';

  /** @type {import('@prisma/client').IdentitySubmission | null | undefined} */
  let focal = writable || waitingReview;

  if (!focal) {
    const latestTerminal = await prisma.identitySubmission.findFirst({
      where: { userId, status: { in: ['APPROVED', 'REJECTED', 'RESUBMISSION_REQUIRED'] } },
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

  /** @type {string[]} */
  const submittedArtifactsOrdered = REQUIRED_ARTIFACT_TYPES.filter((t) => uploadedSet.has(t));

  const allConfirmed = REQUIRED_ARTIFACT_TYPES.every((t) => uploadedSet.has(t));

  /** @type {boolean} */
  let canSubmitForReview = Boolean(
    focal &&
      (focal.status === 'DRAFT' || focal.status === 'PENDING_UPLOADS') &&
      allConfirmed
  );

  if (focal && (focal.status === 'READY_FOR_REVIEW' || focal.status === 'UNDER_MANUAL_REVIEW')) {
    canSubmitForReview = false;
  }

  /** @type {string} */
  let messagePt = '';

  if (identityStatus === 'NOT_STARTED') {
    messagePt = 'Você ainda não iniciou o envio de documentos.';
  } else if (identityStatus === 'DRAFT' || identityStatus === 'PENDING_UPLOADS') {
    messagePt = 'Continue o envio dos documentos obrigatórios e confirme cada arquivo após upload.';
    if (allConfirmed) {
      messagePt = 'Todos os documentos foram confirmados. Você já pode enviar para análise.';
    }
  } else if (identityStatus === 'READY_FOR_REVIEW' || identityStatus === 'UNDER_MANUAL_REVIEW') {
    messagePt = 'Seus documentos foram recebidos e estão na fila de análise.';
  } else if (identityStatus === 'APPROVED') {
    messagePt = 'Sua identidade foi aprovada.';
  } else if (identityStatus === 'REJECTED' || identityStatus === 'RESUBMISSION_REQUIRED') {
    messagePt = 'É necessário reenviar documentos conforme comunicação anterior.';
  }

  return {
    emailVerified: user.isVerificado,
    identityStatus,
    identityReviewStatus: user.identityReviewStatus,
    requiredArtifacts: [...REQUIRED_ARTIFACT_TYPES],
    submittedArtifacts: submittedArtifactsOrdered,
    canSubmitForReview,
    activeSubmissionId: focal ? focal.id : null,
    message: messagePt,
  };
}

/**
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 * @param {string} userId
 */
async function resolveWritableSubmission(tx, userId) {
  const locked = await tx.identitySubmission.findFirst({
    where: { userId, status: { in: ['READY_FOR_REVIEW', 'UNDER_MANUAL_REVIEW'] } },
    orderBy: { createdAt: 'desc' },
  });
  if (locked) {
    throw httpError(409, 'IDENTITY_LOCKED_WAITING_REVIEW', 'Documentos já enviados para análise.');
  }

  const approved = await tx.identitySubmission.findFirst({
    where: { userId, status: 'APPROVED' },
    orderBy: { createdAt: 'desc' },
  });
  if (approved) {
    throw httpError(409, 'IDENTITY_ALREADY_APPROVED', 'Identidade já aprovada.');
  }

  let work = await tx.identitySubmission.findFirst({
    where: { userId, status: { in: ['DRAFT', 'PENDING_UPLOADS'] } },
    orderBy: { createdAt: 'desc' },
    include: { artifacts: true },
  });

  if (work) return work;

  const prevCount = await tx.identitySubmission.count({ where: { userId } });
  const created = await tx.identitySubmission.create({
    data: {
      userId,
      status: 'DRAFT',
      versionOrAttempt: prevCount + 1,
    },
    include: { artifacts: true },
  });

  await tx.user.update({
    where: { id: userId },
    data: { lastIdentitySubmissionId: created.id },
  });

  return created;
}

/**
 * @param {string} userId
 * @param {{ artifactType: string, mimeType: string, byteSize: number }} input
 */
async function presignUpload(userId, input) {
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

  const okMime = identityStorage.validateAllowedMimeType(input.mimeType);
  if (!okMime.valid) {
    throw httpError(400, okMime.code, okMime.message);
  }

  const okSize = identityStorage.validateMaxFileSize(input.byteSize);
  if (!okSize.valid) {
    throw httpError(400, okSize.code, okSize.message);
  }

  const bucket = bucketFromEnv();

  const shortExt = mimeToShortExt(okMime.mimeType);
  if (!shortExt) {
    throw httpError(400, 'MIME_NOT_MAPPED', 'Não foi possível mapear extensão para o MIME informado');
  }

  /** @type {{ id: string, submissionId: string } | null} */
  let createdMeta = null;
  let isNewArtifactRow = false;

  await prisma.$transaction(async (tx) => {
    const submission = await resolveWritableSubmission(tx, userId);

    const existing = await tx.identitySubmissionArtifact.findFirst({
      where: { submissionId: submission.id, type: artifactEnum },
    });

    if (existing && existing.uploadStatus === 'UPLOAD_CONFIRMED') {
      throw httpError(
        409,
        'IDENTITY_ARTIFACT_ALREADY_CONFIRMED',
        'Este tipo de documento já foi confirmado. Nova versão ficará disponível apenas após solicitação de reenvio.'
      );
    }

    const artifactId = existing?.id || generateArtifactIdOpaque();

    const objectKey = identityStorage.buildIdentityObjectKey({
      userId,
      submissionId: submission.id,
      artifactId,
      artifactType: artifactEnum,
      extension: shortExt,
    });

    /** @type {import('@prisma/client').IdentitySubmissionArtifact} */
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
        userId,
        submissionId: createdMeta.submissionId,
        artifactId: createdMeta.id,
        artifactType: artifactEnum,
        extension: shortExt,
      }),
      mimeType: input.mimeType,
      byteSize: input.byteSize,
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
      component: 'identity_service',
      op: 'kyc_presign',
      submissionIdLen: createdMeta.submissionId.length,
      artifactIdLen: createdMeta.id.length,
    },
    'kyc_presign_issued'
  );

  return {
    submissionId: createdMeta.submissionId,
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
 * @param {string} userId
 * @param {{ artifactId: string, checksumSHA256?: string }} input
 */
async function confirmUpload(userId, input) {
  const artifactId = String(input.artifactId || '').trim();
  if (!artifactId) {
    throw httpError(400, 'VALIDATION_ERROR', 'artifactId é obrigatório');
  }

  const art = await prisma.identitySubmissionArtifact.findFirst({
    where: { id: artifactId },
    include: {
      submission: true,
    },
  });

  if (!art || art.submission.userId !== userId) {
    throw httpError(403, 'ARTIFACT_ACCESS_DENIED', 'Artefato inválido ou não pertencente ao usuário.');
  }

  if (art.uploadStatus !== 'AWAITING_UPLOAD') {
    return {
      artifactId: art.id,
      submissionId: art.submissionId,
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
      'Não foi possível validar o arquivo no armazenamento tente novamente em instantes.'
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
    submissionId: updated.submissionId,
    uploadStatus: updated.uploadStatus,
    idempotent: false,
  };
}

async function submitForReview(userId) {
  /** @type {import('@prisma/client').IdentitySubmission & {artifacts: import('@prisma/client').IdentitySubmissionArtifact[]}|null} */
  const awaiting = await prisma.identitySubmission.findFirst({
    where: { userId, status: 'READY_FOR_REVIEW' },
    orderBy: { submittedForReviewAt: 'desc' },
    include: { artifacts: true },
  });

  if (awaiting) {
    await prisma.user.update({
      where: { id: userId },
      data: { identityReviewStatus: 'PENDING' },
    });
    return {
      submissionId: awaiting.id,
      status: awaiting.status,
      idempotent: true,
    };
  }

  return prisma.$transaction(async (tx) => {
    const sub = await tx.identitySubmission.findFirst({
      where: { userId, status: { in: ['DRAFT', 'PENDING_UPLOADS'] } },
      orderBy: { updatedAt: 'desc' },
      include: { artifacts: true },
    });

    if (!sub) {
      throw httpError(400, 'IDENTITY_SUBMIT_NO_ACTIVE', 'Não há envio ativo para concluir.');
    }

    const confirmed = sub.artifacts.filter((a) => a.uploadStatus === 'UPLOAD_CONFIRMED');

    /** @type {Set<string>} */
    const ts = new Set(confirmed.map((a) => a.type));
    for (const reqT of REQUIRED_ARTIFACT_TYPES) {
      if (!ts.has(reqT)) {
        throw httpError(
          400,
          'IDENTITY_MISSING_ARTIFACTS',
          'Envie e confira frente, verso do documento e selfie; confirme cada upload antes de enviar.'
        );
      }
    }

    const updatedSubmission = await tx.identitySubmission.update({
      where: { id: sub.id },
      data: {
        status: 'READY_FOR_REVIEW',
        submittedForReviewAt: new Date(),
      },
    });

    await tx.user.update({
      where: { id: userId },
      data: { identityReviewStatus: 'PENDING' },
    });

    return {
      submissionId: updatedSubmission.id,
      status: updatedSubmission.status,
      idempotent: false,
    };
  });
}

module.exports = {
  REQUIRED_ARTIFACT_TYPES,
  getKycStatus,
  presignUpload,
  confirmUpload,
  submitForReview,
};
