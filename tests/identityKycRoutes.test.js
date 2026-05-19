'use strict';

const request = require('supertest');
const app = require('../src/server');
const { prisma } = require('../src/config/database');
const logger = require('../src/utils/logger');
const identityStorage = require('../src/services/identityStorageService');

jest.mock('../src/services/identityStorageService', () => {
  const actual = jest.requireActual('../src/services/identityStorageService');
  return {
    ...actual,
    isIdentityStorageFeatureFlagOn: jest.fn(() => true),
    createPresignedUploadUrl: jest.fn(),
    headIdentityObjectMetadata: jest.fn(),
  };
});

const AUTH_HEADER = { Authorization: 'Bearer mock-jwt-token' };

function wireKycUserFindUniqueBaseline() {
  prisma.user.findUnique.mockImplementation((args) => {
    const sel = args && args.select;
    if (sel && Object.prototype.hasOwnProperty.call(sel, 'identityReviewStatus')) {
      return Promise.resolve({
        id: 'test-user-id',
        isVerificado: false,
        identityReviewStatus: 'NONE',
        identityApprovedAt: null,
      });
    }
    return Promise.resolve(global.testUser);
  });
}

describe('Identity KYC /api/me (Fatia 6 — com confirmação HEAD Fatia 6.1)', () => {
  beforeAll(() => {
    process.env.FEATURE_KYC_ENABLED = 'true';
    process.env.KYC_STORAGE_BUCKET = 'test-kyc-bucket';
    process.env.KYC_STORAGE_ACCESS_KEY_ID = 'kid';
    process.env.KYC_STORAGE_SECRET_ACCESS_KEY = 'secret';
  });

  beforeEach(() => {
    prisma.$transaction.mockImplementation(async (cb) => cb(prisma));
    prisma.identitySubmission.findFirst.mockReset();
    prisma.identitySubmission.create.mockReset();
    prisma.identitySubmission.update.mockReset();
    prisma.identitySubmission.count.mockReset();
    prisma.identitySubmissionArtifact.findFirst.mockReset();
    prisma.identitySubmissionArtifact.create.mockReset();
    prisma.identitySubmissionArtifact.deleteMany.mockReset();
    prisma.identitySubmissionArtifact.update.mockReset();
    prisma.user.update.mockReset();
    wireKycUserFindUniqueBaseline();
    identityStorage.isIdentityStorageFeatureFlagOn.mockReturnValue(true);
    identityStorage.headIdentityObjectMetadata.mockReset();
    identityStorage.headIdentityObjectMetadata.mockResolvedValue({
      contentLength: 1024,
      contentType: 'image/jpeg',
    });
    identityStorage.createPresignedUploadUrl.mockResolvedValue({
      url:
        'https://bucket.s3.amazonaws.com/key?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=deadbeef&CrazySigned=1',
      expiresAt: '2099-01-01T00:00:00.000Z',
      ttlSeconds: 900,
    });
  });

  it('GET /api/me/kyc-status sem submissions retorna NOT_STARTED e NONE', async () => {
    prisma.identitySubmission.findFirst.mockResolvedValue(null);

    const res = await request(app).get('/api/me/kyc-status').set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.emailVerified).toBe(false);
    expect(res.body.data.identityStatus).toBe('NOT_STARTED');
    expect(res.body.data.identityReviewStatus).toBe('NONE');
    expect(res.body.data.canSubmitForReview).toBe(false);
    expect(Array.isArray(res.body.data.requiredArtifacts)).toBe(true);
  });

  it('POST presign cria submission/artifact e retorna dados sem logar signed URL', async () => {
    prisma.identitySubmission.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    prisma.identitySubmission.count.mockResolvedValue(0);
    prisma.identitySubmission.create.mockResolvedValue({
      id: 'sub_new',
      userId: 'test-user-id',
      status: 'DRAFT',
      artifacts: [],
      updatedAt: new Date(),
      createdAt: new Date(),
    });
    prisma.user.update.mockResolvedValue({});
    prisma.identitySubmissionArtifact.findFirst.mockResolvedValue(null);
    prisma.identitySubmissionArtifact.create.mockImplementation(({ data }) =>
      Promise.resolve({
        ...data,
      })
    );
    prisma.identitySubmission.update.mockResolvedValue({
      id: 'sub_new',
      status: 'PENDING_UPLOADS',
    });

    const res = await request(app).post('/api/me/kyc/presign').set(AUTH_HEADER).send({
      artifactType: 'DOCUMENT_FRONT',
      mimeType: 'image/jpeg',
      byteSize: 1024,
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.submissionId).toBe('sub_new');
    expect(res.body.data.artifactId).toBeTruthy();
    expect(res.body.data.uploadUrl).toContain('X-Amz-Signature');

    expect(identityStorage.createPresignedUploadUrl).toHaveBeenCalled();
    const audited = logger.info.mock.calls.filter(
      ([meta]) => meta && meta.component === 'identity_service' && meta.op === 'kyc_presign'
    );
    expect(audited.length).toBeGreaterThanOrEqual(1);
    audited.forEach((call) => {
      const blob = JSON.stringify(call);
      expect(blob).not.toMatch(/X-Amz-Signature/i);
      expect(blob).not.toMatch(/amazonaws\.com/i);
      expect(blob).not.toContain('deadbeef');
    });
  });

  it('presign rejeita mime inválido e não transaciona', async () => {
    const res = await request(app).post('/api/me/kyc/presign').set(AUTH_HEADER).send({
      artifactType: 'DOCUMENT_FRONT',
      mimeType: 'image/gif',
      byteSize: 1024,
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MIME_NOT_ALLOWED');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('presign rejeita arquivo acima do limite', async () => {
    const huge = identityStorage.getAllowedUploadMaxBytes() + 1;
    const res = await request(app).post('/api/me/kyc/presign').set(AUTH_HEADER).send({
      artifactType: 'DOCUMENT_FRONT',
      mimeType: 'image/png',
      byteSize: huge,
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('SIZE_TOO_LARGE');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('confirm-upload sucesso quando HEAD encontra metadados coerentes', async () => {
    prisma.identitySubmissionArtifact.findFirst.mockResolvedValue({
      id: 'confok',
      submissionId: 'sconf',
      uploadStatus: 'AWAITING_UPLOAD',
      bucket: 'test-kyc-bucket',
      objectKey: 'identity/sconf/confok.jpeg',
      byteSize: 1024,
      mimeType: 'image/jpeg',
      submission: { userId: 'test-user-id' },
    });

    prisma.identitySubmissionArtifact.update.mockResolvedValue({
      id: 'confok',
      submissionId: 'sconf',
      uploadStatus: 'UPLOAD_CONFIRMED',
    });

    const res = await request(app).post('/api/me/kyc/confirm-upload').set(AUTH_HEADER).send({
      artifactId: 'confok',
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.uploadStatus).toBe('UPLOAD_CONFIRMED');
    expect(identityStorage.headIdentityObjectMetadata).toHaveBeenCalledWith({
      bucket: 'test-kyc-bucket',
      objectKey: 'identity/sconf/confok.jpeg',
    });
    expect(JSON.stringify(res.body)).not.toMatch(/identity\/sconf\/confok\.jpeg/);
    expect(prisma.identitySubmissionArtifact.update).toHaveBeenCalled();
  });

  it('confirm-upload rejeita quando objeto não existe (HEAD)', async () => {
    const err = new Error('Objeto não encontrado');
    err.code = 'UPLOAD_OBJECT_NOT_FOUND';
    err.statusCode = 404;
    identityStorage.headIdentityObjectMetadata.mockRejectedValue(err);

    prisma.identitySubmissionArtifact.findFirst.mockResolvedValue({
      id: 'gone',
      submissionId: 's1',
      uploadStatus: 'AWAITING_UPLOAD',
      bucket: 'b',
      objectKey: 'identity/s1/g.jpeg',
      byteSize: 9,
      mimeType: 'image/png',
      submission: { userId: 'test-user-id' },
    });

    const res = await request(app).post('/api/me/kyc/confirm-upload').set(AUTH_HEADER).send({
      artifactId: 'gone',
    });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('UPLOAD_OBJECT_NOT_FOUND');
    expect(prisma.identitySubmissionArtifact.update).not.toHaveBeenCalled();
  });

  it('confirm-upload rejeita quando tamanho não confere', async () => {
    identityStorage.headIdentityObjectMetadata.mockResolvedValue({
      contentLength: 50,
      contentType: 'image/jpeg',
    });

    prisma.identitySubmissionArtifact.findFirst.mockResolvedValue({
      id: 'sz',
      submissionId: 's1',
      uploadStatus: 'AWAITING_UPLOAD',
      bucket: 'b',
      objectKey: 'identity/s1/g.jpeg',
      byteSize: 1024,
      mimeType: 'image/jpeg',
      submission: { userId: 'test-user-id' },
    });

    const res = await request(app).post('/api/me/kyc/confirm-upload').set(AUTH_HEADER).send({
      artifactId: 'sz',
    });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('UPLOAD_METADATA_MISMATCH');
    expect(prisma.identitySubmissionArtifact.update).not.toHaveBeenCalled();
  });

  it('confirm-upload rejeita quando MIME declarado diverge do HEAD', async () => {
    identityStorage.headIdentityObjectMetadata.mockResolvedValue({
      contentLength: 100,
      contentType: 'image/png',
    });

    prisma.identitySubmissionArtifact.findFirst.mockResolvedValue({
      id: 'mime',
      submissionId: 's1',
      uploadStatus: 'AWAITING_UPLOAD',
      bucket: 'b',
      objectKey: 'identity/s1/m.jpeg',
      byteSize: 100,
      mimeType: 'image/jpeg',
      submission: { userId: 'test-user-id' },
    });

    const res = await request(app).post('/api/me/kyc/confirm-upload').set(AUTH_HEADER).send({
      artifactId: 'mime',
    });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('UPLOAD_METADATA_MISMATCH');
    expect(prisma.identitySubmissionArtifact.update).not.toHaveBeenCalled();
  });

  it('confirm-upload rejeita artifact de outro usuário', async () => {
    prisma.identitySubmissionArtifact.findFirst.mockResolvedValue({
      id: 'a1',
      submissionId: 's1',
      uploadStatus: 'AWAITING_UPLOAD',
      submission: { userId: 'outro-usuario' },
    });

    const res = await request(app).post('/api/me/kyc/confirm-upload').set(AUTH_HEADER).send({
      artifactId: 'a1',
    });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ARTIFACT_ACCESS_DENIED');
    expect(identityStorage.headIdentityObjectMetadata).not.toHaveBeenCalled();
  });

  it('submit rejeita quando faltam artifacts obrigatórios confirmados', async () => {
    prisma.identitySubmission.findFirst.mockImplementation((args = {}) => {
      const st = args.where && args.where.status;
      if (st === 'READY_FOR_REVIEW') return Promise.resolve(null);
      return Promise.resolve({
        id: 's_partial',
        userId: 'test-user-id',
        status: 'PENDING_UPLOADS',
        artifacts: [
          { type: 'DOCUMENT_FRONT', uploadStatus: 'UPLOAD_CONFIRMED' },
          { type: 'DOCUMENT_BACK', uploadStatus: 'UPLOAD_CONFIRMED' },
        ],
        updatedAt: new Date(),
      });
    });

    const res = await request(app).post('/api/me/kyc/submit').set(AUTH_HEADER).send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('IDENTITY_MISSING_ARTIFACTS');
  });

  it('submit transição READY_FOR_REVIEW quando os três estão UPLOAD_CONFIRMED', async () => {
    prisma.identitySubmission.findFirst.mockImplementation((args = {}) => {
      const st = args.where && args.where.status;
      if (st === 'READY_FOR_REVIEW') return Promise.resolve(null);
      if (st && typeof st === 'object' && st.in && st.in.includes('DRAFT')) {
        return Promise.resolve({
          id: 's_full',
          userId: 'test-user-id',
          status: 'PENDING_UPLOADS',
          artifacts: [
            { type: 'DOCUMENT_FRONT', uploadStatus: 'UPLOAD_CONFIRMED' },
            { type: 'DOCUMENT_BACK', uploadStatus: 'UPLOAD_CONFIRMED' },
            { type: 'SELFIE_PORTRAIT', uploadStatus: 'UPLOAD_CONFIRMED' },
          ],
          updatedAt: new Date(),
        });
      }
      return Promise.resolve(null);
    });

    prisma.identitySubmission.update.mockResolvedValue({
      id: 's_full',
      status: 'READY_FOR_REVIEW',
      submittedForReviewAt: new Date(),
    });
    prisma.user.update.mockResolvedValue({});

    const res = await request(app).post('/api/me/kyc/submit').set(AUTH_HEADER).send({});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('READY_FOR_REVIEW');
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'test-user-id' },
        data: expect.objectContaining({ identityReviewStatus: 'PENDING' }),
      })
    );
  });

  it('rejeita userId no body (presign)', async () => {
    const res = await request(app)
      .post('/api/me/kyc/presign')
      .set(AUTH_HEADER)
      .send({ userId: 'evil-user', artifactType: 'DOCUMENT_FRONT', mimeType: 'image/jpeg', byteSize: 1 });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('USER_ID_BODY_FORBIDDEN');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('FEATURE_KYC_ENABLED desliga confirm-upload com 503', async () => {
    identityStorage.isIdentityStorageFeatureFlagOn.mockReturnValue(false);

    prisma.identitySubmissionArtifact.findFirst.mockResolvedValue({
      id: 'blocked',
      submissionId: 's1',
      uploadStatus: 'AWAITING_UPLOAD',
      bucket: 'b',
      objectKey: 'identity/s1/z.jpeg',
      byteSize: 1,
      mimeType: 'image/jpeg',
      submission: { userId: 'test-user-id' },
    });

    const res = await request(app).post('/api/me/kyc/confirm-upload').set(AUTH_HEADER).send({
      artifactId: 'blocked',
    });

    expect(res.status).toBe(503);
    expect(identityStorage.headIdentityObjectMetadata).not.toHaveBeenCalled();
    expect(prisma.identitySubmissionArtifact.update).not.toHaveBeenCalled();
  });

  it('FEATURE_KYC_ENABLED desliga presign com 503', async () => {
    identityStorage.isIdentityStorageFeatureFlagOn.mockReturnValue(false);

    const res = await request(app).post('/api/me/kyc/presign').set(AUTH_HEADER).send({
      artifactType: 'DOCUMENT_FRONT',
      mimeType: 'image/jpeg',
      byteSize: 1024,
    });

    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
