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

jest.mock('../src/services/kycAutoDecisionService', () => ({
  evaluateSubmission: jest.fn(() =>
    Promise.resolve({
      recommendation: 'APPROVED',
      applied: false,
      shadow: true,
      enabled: false,
    })
  ),
}));

const AUTH_HEADER = { Authorization: 'Bearer mock-jwt-token' };
const kycAutoDecision = require('../src/services/kycAutoDecisionService');
const { KYC_PUBLIC_MESSAGES } = require('../src/constants/kycPublicMessages');

async function flushPostSubmitAutoDecision() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

function wirePresignTransactionHappyPath(submissionId = 'sub_new') {
  prisma.identitySubmission.findFirst
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce(null);
  prisma.identitySubmission.count.mockResolvedValue(0);
  prisma.identitySubmission.create.mockResolvedValue({
    id: submissionId,
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
    id: submissionId,
    status: 'PENDING_UPLOADS',
  });
}

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
    delete process.env.FEATURE_KYC_REQUIRE_FACE_VIDEO;
    process.env.FEATURE_KYC_AUTO_DECISION_ENABLED = 'false';
    process.env.FEATURE_KYC_AUTO_DECISION_SHADOW = 'true';
    prisma.$transaction.mockImplementation(async (cb) => cb(prisma));
    prisma.identitySubmission.findFirst.mockReset();
    prisma.identitySubmission.create.mockReset();
    prisma.identitySubmission.update.mockReset();
    prisma.identitySubmission.updateMany.mockReset();
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
    kycAutoDecision.evaluateSubmission.mockClear();
    kycAutoDecision.evaluateSubmission.mockResolvedValue({
      recommendation: 'APPROVED',
      applied: false,
      shadow: true,
      enabled: false,
    });
    logger.error.mockClear();
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
    expect(res.body.data.requiredArtifacts).toEqual([
      'DOCUMENT_FRONT',
      'DOCUMENT_BACK',
      'SELFIE_PORTRAIT',
    ]);
  });

  it('POST presign cria submission/artifact e retorna dados sem logar signed URL', async () => {
    wirePresignTransactionHappyPath();

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

  describe('Fatia 3 — FEATURE_KYC_REQUIRE_FACE_VIDEO', () => {
    beforeEach(() => {
      process.env.FEATURE_KYC_REQUIRE_FACE_VIDEO = 'true';
    });

    it('GET /api/me/kyc-status retorna 4 requiredArtifacts incluindo FACE_VIDEO', async () => {
      prisma.identitySubmission.findFirst.mockResolvedValue(null);

      const res = await request(app).get('/api/me/kyc-status').set(AUTH_HEADER);

      expect(res.status).toBe(200);
      expect(res.body.data.requiredArtifacts).toEqual([
        'DOCUMENT_FRONT',
        'DOCUMENT_BACK',
        'SELFIE_PORTRAIT',
        'FACE_VIDEO',
      ]);
    });

    it('submit com 3/3 confirmados retorna IDENTITY_MISSING_ARTIFACTS', async () => {
      prisma.identitySubmission.findFirst.mockImplementation((args = {}) => {
        const st = args.where && args.where.status;
        if (st === 'READY_FOR_REVIEW') return Promise.resolve(null);
        return Promise.resolve({
          id: 's_three_only',
          userId: 'test-user-id',
          status: 'PENDING_UPLOADS',
          artifacts: [
            { type: 'DOCUMENT_FRONT', uploadStatus: 'UPLOAD_CONFIRMED' },
            { type: 'DOCUMENT_BACK', uploadStatus: 'UPLOAD_CONFIRMED' },
            { type: 'SELFIE_PORTRAIT', uploadStatus: 'UPLOAD_CONFIRMED' },
          ],
          updatedAt: new Date(),
        });
      });

      const res = await request(app).post('/api/me/kyc/submit').set(AUTH_HEADER).send({});
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('IDENTITY_MISSING_ARTIFACTS');
    });

    it('submit com 4/4 confirmados retorna READY_FOR_REVIEW', async () => {
      prisma.identitySubmission.findFirst.mockImplementation((args = {}) => {
        const st = args.where && args.where.status;
        if (st === 'READY_FOR_REVIEW') return Promise.resolve(null);
        if (st && typeof st === 'object' && st.in && st.in.includes('DRAFT')) {
          return Promise.resolve({
            id: 's_four',
            userId: 'test-user-id',
            status: 'PENDING_UPLOADS',
            artifacts: [
              { type: 'DOCUMENT_FRONT', uploadStatus: 'UPLOAD_CONFIRMED' },
              { type: 'DOCUMENT_BACK', uploadStatus: 'UPLOAD_CONFIRMED' },
              { type: 'SELFIE_PORTRAIT', uploadStatus: 'UPLOAD_CONFIRMED' },
              { type: 'FACE_VIDEO', uploadStatus: 'UPLOAD_CONFIRMED' },
            ],
            updatedAt: new Date(),
          });
        }
        return Promise.resolve(null);
      });

      prisma.identitySubmission.update.mockResolvedValue({
        id: 's_four',
        status: 'READY_FOR_REVIEW',
        submittedForReviewAt: new Date(),
      });
      prisma.user.update.mockResolvedValue({});

      const res = await request(app).post('/api/me/kyc/submit').set(AUTH_HEADER).send({});
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('READY_FOR_REVIEW');
    });

    it.each([
      ['video/webm', 'webm'],
      ['video/mp4', 'mp4'],
    ])('presign FACE_VIDEO aceita %s', async (mimeType, ext) => {
      wirePresignTransactionHappyPath('sub_video');

      const res = await request(app).post('/api/me/kyc/presign').set(AUTH_HEADER).send({
        artifactType: 'FACE_VIDEO',
        mimeType,
        byteSize: 2048,
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(identityStorage.createPresignedUploadUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          artifactType: 'FACE_VIDEO',
          mimeType,
        })
      );
      const createCall = prisma.identitySubmissionArtifact.create.mock.calls[0][0];
      expect(createCall.data.objectKey).toMatch(new RegExp(`\\.${ext}$`));
    });

    it('presign FACE_VIDEO rejeita image/jpeg', async () => {
      const res = await request(app).post('/api/me/kyc/presign').set(AUTH_HEADER).send({
        artifactType: 'FACE_VIDEO',
        mimeType: 'image/jpeg',
        byteSize: 1024,
      });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('MIME_NOT_ALLOWED');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it.each(['DOCUMENT_FRONT', 'DOCUMENT_BACK', 'SELFIE_PORTRAIT'])(
      'presign %s rejeita video/mp4',
      async (artifactType) => {
        const res = await request(app).post('/api/me/kyc/presign').set(AUTH_HEADER).send({
          artifactType,
          mimeType: 'video/mp4',
          byteSize: 1024,
        });

        expect(res.status).toBe(400);
        expect(res.body.code).toBe('MIME_NOT_ALLOWED');
        expect(prisma.$transaction).not.toHaveBeenCalled();
      }
    );
  });

  describe('Fatia 3 — mensagens públicas em GET /api/me/kyc-status', () => {
    function mockFocalStatus(status) {
      const row = {
        id: 'sub-msg',
        userId: 'test-user-id',
        status,
        artifacts: [],
      };
      prisma.identitySubmission.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(
          status === 'READY_FOR_REVIEW' || status === 'UNDER_MANUAL_REVIEW' ? row : null
        )
        .mockResolvedValueOnce(
          status === 'APPROVED' || status === 'REJECTED' || status === 'RESUBMISSION_REQUIRED'
            ? row
            : null
        );
    }

    it.each([
      ['READY_FOR_REVIEW', KYC_PUBLIC_MESSAGES.READY_FOR_REVIEW],
      ['UNDER_MANUAL_REVIEW', KYC_PUBLIC_MESSAGES.UNDER_MANUAL_REVIEW],
      ['APPROVED', KYC_PUBLIC_MESSAGES.APPROVED],
      ['RESUBMISSION_REQUIRED', KYC_PUBLIC_MESSAGES.RESUBMISSION_REQUIRED],
      ['REJECTED', KYC_PUBLIC_MESSAGES.REJECTED],
    ])('identityStatus %s retorna mensagem pública canônica', async (status, expectedMsg) => {
      mockFocalStatus(status);

      const res = await request(app).get('/api/me/kyc-status').set(AUTH_HEADER);

      expect(res.status).toBe(200);
      expect(res.body.data.identityStatus).toBe(status);
      expect(res.body.data.message).toBe(expectedMsg);
      expect(res.body.data.message).not.toMatch(/cpf|duplicad|score|renda|negativa|objectKey/i);
    });
  });

  describe('Fatia 2 — AutoDecision shadow pós-submit', () => {
    function wireSubmitHappyPath(submissionId = 's_full') {
      prisma.identitySubmission.findFirst.mockImplementation((args = {}) => {
        const st = args.where && args.where.status;
        if (st === 'READY_FOR_REVIEW') return Promise.resolve(null);
        if (st && typeof st === 'object' && st.in && st.in.includes('DRAFT')) {
          return Promise.resolve({
            id: submissionId,
            userId: 'test-user-id',
            status: 'PENDING_UPLOADS',
            versionOrAttempt: 1,
            decidedAt: null,
            artifacts: [
              { type: 'DOCUMENT_FRONT', uploadStatus: 'UPLOAD_CONFIRMED', mimeType: 'image/jpeg', byteSize: 1000 },
              { type: 'DOCUMENT_BACK', uploadStatus: 'UPLOAD_CONFIRMED', mimeType: 'image/jpeg', byteSize: 1000 },
              { type: 'SELFIE_PORTRAIT', uploadStatus: 'UPLOAD_CONFIRMED', mimeType: 'image/jpeg', byteSize: 1000 },
            ],
            updatedAt: new Date(),
          });
        }
        return Promise.resolve(null);
      });
      prisma.identitySubmission.update.mockResolvedValue({
        id: submissionId,
        status: 'READY_FOR_REVIEW',
        submittedForReviewAt: new Date(),
      });
      prisma.user.update.mockResolvedValue({});
    }

    it('submit dispara evaluateSubmission em shadow após READY_FOR_REVIEW', async () => {
      wireSubmitHappyPath('s_shadow');

      const res = await request(app).post('/api/me/kyc/submit').set(AUTH_HEADER).send({});

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('READY_FOR_REVIEW');
      await flushPostSubmitAutoDecision();
      expect(kycAutoDecision.evaluateSubmission).toHaveBeenCalledWith('s_shadow', {
        trigger: 'post_submit',
      });
    });

    it('erro do AutoDecision não quebra submit', async () => {
      wireSubmitHappyPath('s_err_motor');
      kycAutoDecision.evaluateSubmission.mockRejectedValueOnce(new Error('motor indisponível'));

      const res = await request(app).post('/api/me/kyc/submit').set(AUTH_HEADER).send({});

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('READY_FOR_REVIEW');
      await flushPostSubmitAutoDecision();
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          op: 'kyc_auto_decision_post_submit_failed',
          submissionIdLen: 's_err_motor'.length,
        }),
        'kyc_auto_decision_post_submit_failed'
      );
    });

    it('flags default: motor retorna shadow sem applied e status permanece READY_FOR_REVIEW', async () => {
      wireSubmitHappyPath('s_no_apply');
      kycAutoDecision.evaluateSubmission.mockResolvedValueOnce({
        recommendation: 'UNDER_MANUAL_REVIEW',
        applied: false,
        shadow: true,
        enabled: false,
      });

      const res = await request(app).post('/api/me/kyc/submit').set(AUTH_HEADER).send({});

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('READY_FOR_REVIEW');
      await flushPostSubmitAutoDecision();
      const motorResult = await kycAutoDecision.evaluateSubmission.mock.results[0].value;
      expect(motorResult.applied).toBe(false);
      expect(motorResult.shadow).toBe(true);
      expect(prisma.identitySubmission.updateMany).not.toHaveBeenCalled();
    });

    it('submit idempotente não dispara AutoDecision novamente', async () => {
      prisma.identitySubmission.findFirst.mockResolvedValue({
        id: 's_idem',
        userId: 'test-user-id',
        status: 'READY_FOR_REVIEW',
        artifacts: [],
        submittedForReviewAt: new Date(),
      });
      prisma.user.update.mockResolvedValue({});

      const res = await request(app).post('/api/me/kyc/submit').set(AUTH_HEADER).send({});

      expect(res.status).toBe(200);
      expect(res.body.data.idempotent).toBe(true);
      await flushPostSubmitAutoDecision();
      expect(kycAutoDecision.evaluateSubmission).not.toHaveBeenCalled();
    });
  });
});
