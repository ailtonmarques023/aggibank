'use strict';

/**
 * Armazenamento S3-compatível para artefatos de identidade (KYC infra — Fatia 4).
 *
 * Segurança:
 * - Paths opacos identity/{submissionId}/{artifactId} sem CPF, e-mail ou nome.
 * - URLs assinadas nunca devem ir para logs (nem aqui nem nas rotas futuras).
 * - Não acoplado ao router; apenas preparação de infra até FEATURE_KYC_ENABLED.
 */

const { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const logger = require('../utils/logger');

/** Tipos válidos no Prisma / ADR-KYC-001 (inclui FACE_VIDEO desde Fatia 1). */
const ALLOWED_ARTIFACT_TYPES = Object.freeze([
  'DOCUMENT_FRONT',
  'DOCUMENT_BACK',
  'SELFIE_PORTRAIT',
  'FACE_VIDEO',
]);

const IMAGE_ARTIFACT_TYPES = Object.freeze(['DOCUMENT_FRONT', 'DOCUMENT_BACK', 'SELFIE_PORTRAIT']);

const IMAGE_MIME_ALLOWLIST = Object.freeze(['image/jpeg', 'image/png', 'image/webp']);

const VIDEO_MIME_ALLOWLIST = Object.freeze(['video/webm', 'video/mp4']);

const IMAGE_EXTENSIONS = Object.freeze(['jpg', 'jpeg', 'png', 'webp']);

const VIDEO_EXTENSIONS = Object.freeze(['webm', 'mp4']);

/**
 * Extrai apenas o tipo MIME (sem charset) para comparação com metadados do HEAD.
 * @param {string | undefined | null} raw
 * @returns {string | null}
 */
function normalizeContentTypeMeta(raw) {
  if (!raw || String(raw).trim() === '') return null;
  return String(raw).split(';')[0].trim().toLowerCase();
}

/** @extends Error */
class IdentityStorageDisabledError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message);
    this.name = 'IdentityStorageDisabledError';
    this.code = code;
  }
}

/**
 * FEATURE_KYC_ENABLED=true habilita emissão de presign quando credenciais existem.
 * Próximas rotas devem também respeitar FEATURE_GATE_IDENTITY_APPROVED apenas para autorização produto.
 */
function isIdentityStorageFeatureFlagOn() {
  return String(process.env.FEATURE_KYC_ENABLED || '').toLowerCase().trim() === 'true';
}

function getAllowedUploadMaxBytes() {
  const raw = parseInt(process.env.KYC_UPLOAD_MAX_BYTES, 10);
  const fallback = 15 * 1024 * 1024;
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

function getAllowedVideoUploadMaxBytes() {
  const raw = parseInt(process.env.KYC_VIDEO_UPLOAD_MAX_BYTES, 10);
  const fallback = 30 * 1024 * 1024;
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

function getPresignTtlSeconds() {
  const raw = parseInt(process.env.KYC_PRESIGN_TTL_SECONDS, 10);
  const fallback = 900;
  if (!Number.isFinite(raw) || raw < 30) return fallback;
  if (raw > 3600) return 3600;
  return raw;
}

/**
 * Segmentos de path apenas [a-zA-Z0-9_-] por segurança.
 * @param {string} raw
 * @param {string} fieldName
 * @returns {string}
 */
function sanitizeOpaqueSegment(raw, fieldName) {
  if (raw == null || String(raw).trim() === '') {
    throw new Error(`${fieldName} é obrigatório`);
  }
  const seg = String(raw).trim();
  if (!/^[a-zA-Z0-9_-]+$/.test(seg) || seg.length > 190) {
    throw new Error(`${fieldName}: valor inválido ou muito longo`);
  }
  return seg;
}

function normalizeArtifactType(artifactType) {
  const t = String(artifactType || '').trim().toUpperCase();
  if (!ALLOWED_ARTIFACT_TYPES.includes(t)) {
    throw new Error(`artifactType deve ser um de: ${ALLOWED_ARTIFACT_TYPES.join(', ')}`);
  }
  return t;
}

function isFaceVideoArtifact(artifactType) {
  return normalizeArtifactType(artifactType) === 'FACE_VIDEO';
}

/**
 * Prefixo opcional de tenant/piloto (SEM PII). Ex.: staging/ ou ab-prod/
 * @returns {string} termina com / ou vazio
 */
function getNormalizedTenantPrefix() {
  const raw = String(process.env.KYC_STORAGE_OBJECT_KEY_PREFIX || '').trim().replace(/^\/+/, '').replace(/\/+$/, '');
  if (!raw) return '';
  if (!/^[a-zA-Z0-9/_-]+$/.test(raw) || raw.length > 96) {
    throw new Error('KYC_STORAGE_OBJECT_KEY_PREFIX inválido');
  }
  return raw.endsWith('/') ? raw : `${raw}/`;
}

/**
 * Extensão de arquivo para objectKey, conforme tipo de artefato.
 * @param {string} [extension]
 * @param {string} [artifactType]
 * @returns {string} exemplo ".jpeg" ou ""
 */
function normalizeExtension(extension, artifactType) {
  if (extension == null || String(extension).trim() === '') return '';
  let ext = String(extension).trim().toLowerCase().replace(/^\.+/, '');
  ext = ext.replace(/[^a-z0-9]/g, '');
  if (ext === '') return '';
  if (ext.length > 8) throw new Error('Extensão muito longa');

  const isVideo = artifactType != null && String(artifactType).trim() !== '';
  const allowed = isVideo && isFaceVideoArtifact(artifactType) ? VIDEO_EXTENSIONS : IMAGE_EXTENSIONS;
  const allowedSet = new Set(allowed);
  if (!allowedSet.has(ext)) {
    throw new Error(`Extensão não permitida: ${ext}`);
  }
  return `.${ext}`;
}

/**
 * Mapeia MIME validado → segmento de extensão (sem ponto) para objectKey.
 * @param {string} artifactType
 * @param {string} mimeType
 * @returns {string}
 */
function extensionSegmentForMime(artifactType, mimeType) {
  const t = normalizeArtifactType(artifactType);
  const ok = validateAllowedMimeType(t, mimeType);
  if (!ok.valid) {
    throw new Error(ok.message);
  }
  const m = ok.mimeType;
  if (t === 'FACE_VIDEO') {
    if (m === 'video/webm') return 'webm';
    if (m === 'video/mp4') return 'mp4';
  }
  if (m === 'image/jpeg') return 'jpeg';
  if (m === 'image/png') return 'png';
  if (m === 'image/webp') return 'webp';
  throw new Error('MIME_NOT_MAPPED');
}

/**
 * Monta objectKey opaco. `userId` é validado apenas para garantir uso consistente pela camada chamadora —
 * não entra na chave física no bucket.
 *
 * Formato final: `{prefix}identity/{submissionId}/{artifactId}{extension}`
 *
 * @param {{ userId: string, submissionId: string, artifactId: string, artifactType: string, extension?: string }} params
 * @returns {string}
 */
function buildIdentityObjectKey(params) {
  if (!params || typeof params !== 'object') throw new Error('Parâmetros inválidos');

  const ownerScopeId = params.ownerScopeId ?? params.userId;
  sanitizeOpaqueSegment(ownerScopeId, 'ownerScopeId'); // garante invariante chamada; omitido da key
  const submissionId = sanitizeOpaqueSegment(params.submissionId, 'submissionId');
  const artifactId = sanitizeOpaqueSegment(params.artifactId, 'artifactId');
  const artifactEnum = normalizeArtifactType(params.artifactType);

  const ext = normalizeExtension(params.extension, artifactEnum);

  const base = `${getNormalizedTenantPrefix()}identity/${submissionId}/${artifactId}${ext}`;
  if (base.length > 920) throw new Error('objectKey gerado excede limite pragmático');
  return base;
}

/**
 * Valida MIME conforme tipo de artefato.
 *
 * Compatibilidade Fatia 2: um único argumento string trata-se como MIME de imagem (legado identityService).
 *
 * @param {string} artifactTypeOrMime
 * @param {string} [mimeType]
 * @returns {{ valid: true, mimeType: string } | { valid: false, code: string, message: string }}
 */
function validateAllowedMimeType(artifactTypeOrMime, mimeType) {
  const legacyImageOnly = mimeType === undefined;
  const artifactType = legacyImageOnly ? null : normalizeArtifactType(artifactTypeOrMime);
  const m = String(legacyImageOnly ? artifactTypeOrMime : mimeType || '')
    .trim()
    .toLowerCase();

  if (!m) return { valid: false, code: 'MIME_REQUIRED', message: 'Tipo MIME é obrigatório' };

  if (legacyImageOnly) {
    if (!IMAGE_MIME_ALLOWLIST.includes(m)) {
      return { valid: false, code: 'MIME_NOT_ALLOWED', message: `Tipo MIME não permitido: ${artifactTypeOrMime}` };
    }
    return { valid: true, mimeType: m };
  }

  if (artifactType === 'FACE_VIDEO') {
    if (!VIDEO_MIME_ALLOWLIST.includes(m)) {
      return {
        valid: false,
        code: 'MIME_NOT_ALLOWED',
        message: `Tipo MIME não permitido para FACE_VIDEO: ${mimeType}`,
      };
    }
    return { valid: true, mimeType: m };
  }

  if (!IMAGE_ARTIFACT_TYPES.includes(artifactType)) {
    return { valid: false, code: 'ARTIFACT_TYPE_INVALID', message: 'artifactType inválido' };
  }

  if (!IMAGE_MIME_ALLOWLIST.includes(m)) {
    return {
      valid: false,
      code: 'MIME_NOT_ALLOWED',
      message: `Tipo MIME não permitido para ${artifactType}: ${mimeType}`,
    };
  }

  return { valid: true, mimeType: m };
}

/**
 * Valida tamanho conforme tipo de artefato (ou limite de imagem no modo legado).
 *
 * @param {string | number} artifactTypeOrByteLength
 * @param {number} [byteLength]
 * @returns {{ valid: true } | { valid: false, code: string, message: string }}
 */
function validateMaxFileSize(artifactTypeOrByteLength, byteLength) {
  const legacyImageOnly = byteLength === undefined;
  const n = legacyImageOnly
    ? typeof artifactTypeOrByteLength === 'number'
      ? artifactTypeOrByteLength
      : parseInt(artifactTypeOrByteLength, 10)
    : typeof byteLength === 'number'
      ? byteLength
      : parseInt(byteLength, 10);

  if (!Number.isFinite(n) || n <= 0) {
    return { valid: false, code: 'SIZE_INVALID', message: 'Tamanho do arquivo inválido' };
  }

  let max;
  if (legacyImageOnly) {
    max = getAllowedUploadMaxBytes();
  } else {
    const artifactType = normalizeArtifactType(artifactTypeOrByteLength);
    max = artifactType === 'FACE_VIDEO' ? getAllowedVideoUploadMaxBytes() : getAllowedUploadMaxBytes();
  }

  if (n > max) {
    return { valid: false, code: 'SIZE_TOO_LARGE', message: `Arquivo excede o máximo permitido (${max} bytes)` };
  }
  return { valid: true };
}

function resolveStorageBucket() {
  const b = (process.env.KYC_STORAGE_BUCKET || '').trim();
  if (!b) throw new IdentityStorageDisabledError('KYC_STORAGE_BUCKET', 'Bucket KYC não configurado.');
  return b;
}

function assertStorageOperational() {
  if (!isIdentityStorageFeatureFlagOn()) {
    throw new IdentityStorageDisabledError(
      'FEATURE_KYC_DISABLED',
      'Storage de identidade desligado defina FEATURE_KYC_ENABLED=true e credenciais.'
    );
  }
  resolveStorageBucket();

  const id = String(process.env.KYC_STORAGE_ACCESS_KEY_ID || '').trim();
  const sec = String(process.env.KYC_STORAGE_SECRET_ACCESS_KEY || '').trim();
  if (!id || !sec) {
    throw new IdentityStorageDisabledError(
      'KYC_STORAGE_MISSING_CREDENTIALS',
      'Credenciais KYC_STORAGE_ACCESS_KEY_ID / SECRET ausentes.'
    );
  }

  const provider = String(process.env.KYC_STORAGE_PROVIDER || 's3_compat').trim().toLowerCase();
  if (!['s3_compat', 'r2', 'minio', 'aws', 'b2'].includes(provider)) {
    logger.warn({
      provider,
      category: 'operational_warning',
      component: 'identity_storage_service',
    }, 'KYC_STORAGE_PROVIDER inesperado — usando modo S3 client genérico');
  }
}

/** @type {import('@aws-sdk/client-s3').S3Client | null} */
let _s3Lazy = null;

function buildS3Client() {
  const endpoint = String(process.env.KYC_STORAGE_ENDPOINT || '').trim() || undefined;
  const region = String(process.env.KYC_STORAGE_REGION || 'auto').trim() || 'auto';

  /** @type {import('@aws-sdk/client-s3').S3ClientConfig} */
  const cfg = {
    region: region === 'auto' ? 'us-east-1' : region,
    credentials: {
      accessKeyId: String(process.env.KYC_STORAGE_ACCESS_KEY_ID || '').trim(),
      secretAccessKey: String(process.env.KYC_STORAGE_SECRET_ACCESS_KEY || '').trim(),
    },
  };

  if (endpoint) {
    cfg.endpoint = endpoint;
    cfg.forcePathStyle =
      String(process.env.KYC_STORAGE_FORCE_PATH_STYLE || '').toLowerCase().trim() === 'true' ||
      /r2\.cloudflarestorage\.com|127\.0\.0\.1|localhost|minio/i.test(endpoint);
  }

  return new S3Client(cfg);
}

function getLazyS3() {
  assertStorageOperational();
  if (!_s3Lazy) _s3Lazy = buildS3Client();
  return _s3Lazy;
}

/**
 * PUT assinado (upload cliente direto ao bucket privado).
 * Não faz log da URL — apenas bucket + objectKey (sem query assinatura).
 *
 * @param {{
 *   objectKey: string,
 *   mimeType: string,
 *   byteSize?: number,
 *   artifactType?: string,
 * }} args
 * @returns {Promise<{ url: string, expiresAt: string, ttlSeconds: number }>}
 */
async function createPresignedUploadUrl(args) {
  const artifactType = args.artifactType != null ? normalizeArtifactType(args.artifactType) : null;
  const okMime =
    artifactType != null
      ? validateAllowedMimeType(artifactType, args.mimeType)
      : validateAllowedMimeType(args.mimeType);
  if (!okMime.valid) throw new Error(okMime.message);

  if (args.byteSize != null) {
    const sz =
      artifactType != null
        ? validateMaxFileSize(artifactType, args.byteSize)
        : validateMaxFileSize(args.byteSize);
    if (!sz.valid) throw new Error(sz.message);
  }

  assertStorageOperational();

  const objectKey = String(args.objectKey || '').trim();
  if (!objectKey.startsWith(`${getNormalizedTenantPrefix()}identity/`)) {
    throw new Error('objectKey deve seguir o padrão identity/{submissionId}/{artifactId}');
  }

  const bucket = resolveStorageBucket();
  const client = getLazyS3();
  const ttl = getPresignTtlSeconds();

  const cmd = new PutObjectCommand({
    Bucket: bucket,
    Key: objectKey,
    ContentType: okMime.mimeType,
  });

  const url = await getSignedUrl(client, cmd, { expiresIn: ttl });
  const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();

  logger.info(
    {
      category: 'operational_audit',
      component: 'identity_storage_service',
      op: 'presign_put',
      bucket,
      /** objectKey apenas; não logar signed URL nem query-string */
      objectKeySuffixLength: objectKey.length,
      ttlSeconds: ttl,
    },
    'identity_storage_presign_put_issued'
  );

  return { url, expiresAt, ttlSeconds: ttl };
}

/**
 * GET assinado (ex.: operador interno / confirmação HEAD futura).
 *
 * @param {{ objectKey: string }} args
 * @returns {Promise<{ url: string, expiresAt: string, ttlSeconds: number }>}
 */
async function createPresignedReadUrl(args) {
  assertStorageOperational();

  const objectKey = String(args.objectKey || '').trim();
  if (!objectKey.startsWith(`${getNormalizedTenantPrefix()}identity/`)) {
    throw new Error('objectKey inválido para leitura');
  }

  const bucket = resolveStorageBucket();
  const client = getLazyS3();
  const ttl = getPresignTtlSeconds();

  const cmd = new GetObjectCommand({ Bucket: bucket, Key: objectKey });
  const url = await getSignedUrl(client, cmd, { expiresIn: ttl });
  const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();

  logger.info(
    {
      category: 'operational_audit',
      component: 'identity_storage_service',
      op: 'presign_get',
      bucket,
      objectKeySuffixLength: objectKey.length,
      ttlSeconds: ttl,
    },
    'identity_storage_presign_get_issued'
  );

  return { url, expiresAt, ttlSeconds: ttl };
}

/**
 * HEAD S3-compatível (metadados apenas; sem corpo de objeto).
 * Falha com `code: UPLOAD_OBJECT_NOT_FOUND` e `statusCode: 404` quando o objeto não existe.
 * Logs: nunca objectKey completo, apenas sufixo-length.
 *
 * @param {{ bucket?: string, objectKey: string }}
 * @returns {Promise<{ contentLength: number | undefined, contentType: string | undefined }>}
 */
async function headIdentityObjectMetadata(args) {
  assertStorageOperational();

  const objectKey = String(args.objectKey || '').trim();
  if (!objectKey.startsWith(`${getNormalizedTenantPrefix()}identity/`)) {
    throw new Error('objectKey inválido para head');
  }

  const bucket = String(args.bucket || '').trim() || resolveStorageBucket();
  const client = getLazyS3();

  try {
    const out = await client.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: objectKey,
      })
    );

    logger.info(
      {
        category: 'operational_audit',
        component: 'identity_storage_service',
        op: 'head_identity_object',
        bucket,
        objectKeySuffixLength: objectKey.length,
      },
      'identity_storage_head_ok'
    );

    return {
      contentLength: out.ContentLength !== undefined ? Number(out.ContentLength) : undefined,
      contentType: out.ContentType !== undefined ? String(out.ContentType) : undefined,
    };
  } catch (err) {
    const meta = err && err.$metadata;
    const httpStatus = meta && meta.httpStatusCode;
    const name = err && err.name ? String(err.name) : '';
    /** @type {string | undefined} */
    let s3LikeCode = typeof err.Code === 'string' ? err.Code : undefined;

    logger.warn(
      {
        category: 'contract_error',
        component: 'identity_storage_service',
        op: 'head_identity_object',
        bucket,
        objectKeySuffixLength: objectKey.length,
        httpStatusCode: httpStatus || null,
        errorName: name || null,
        errorCode: s3LikeCode || null,
      },
      'identity_storage_head_failed'
    );

    const isMiss =
      httpStatus === 404 ||
      name === 'NotFound' ||
      /^NotFound\b/i.test(name) ||
      s3LikeCode === 'NotFound' ||
      /NoSuchKey/i.test(name) ||
      s3LikeCode === 'NoSuchKey';

    if (isMiss) {
      const e = new Error('Objeto não encontrado ou upload ainda não concluído no armazenamento.');
      e.name = 'IdentityUploadHeadNotFoundError';
      e.code = 'UPLOAD_OBJECT_NOT_FOUND';
      /** @type {any} */
      const ex = e;
      ex.statusCode = 404;
      throw ex;
    }
    throw err;
  }
}

function resetLazyClientForTests() {
  _s3Lazy = null;
}

module.exports = {
  IdentityStorageDisabledError,
  ALLOWED_ARTIFACT_TYPES,
  IMAGE_ARTIFACT_TYPES,
  isIdentityStorageFeatureFlagOn,
  normalizeArtifactType,
  buildIdentityObjectKey,
  normalizeExtension,
  extensionSegmentForMime,
  validateAllowedMimeType,
  validateMaxFileSize,
  createPresignedUploadUrl,
  createPresignedReadUrl,
  headIdentityObjectMetadata,
  normalizeContentTypeMeta,
  resetLazyClientForTests,
  /** @internal apenas testes **/
  sanitizeOpaqueSegment,
  getNormalizedTenantPrefix,
  getAllowedUploadMaxBytes,
  getAllowedVideoUploadMaxBytes,
  getPresignTtlSeconds,
};
