'use strict';

const request = require('supertest');
const app = require('../src/server');
const { prisma } = require('../src/config/database');
const { hashSessionSecret } = require('../src/services/onboardingSessionService');
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

function applicationRow(overrides = {}) {
  const future = new Date(Date.now() + 60 * 60 * 1000);
  return {
    id: 'app_kyc_1',
    status: 'DRAFT',
    protocolNumber: 'APP-KYC001',
    tokenHash: 'a'.repeat(64),
    tokenExpiresAt: future,
    expiresAt: future,
    aceitaTermos: false,
    aceitaComunicacoes: false,
    nomeCompleto: null,
    email: null,
    cpf: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function sessionCookie(secret = 'onboarding_kyc_session_secret') {
  const row = applicationRow();
  prisma.onboardingSession.findUnique.mockResolvedValue({
    id: 'sess_kyc',
    applicationId: row.id,
    sessionHash: hashSessionSecret(secret),
    status: 'ACTIVE',
    expiresAt: new Date(Date.now() + 3600000),
    application: row,
  });
  prisma.onboardingSession.update.mockResolvedValue({});
  return `agilbank_onboarding_session=${secret}`;
}

function wirePresignHappyPath(applicationId = 'app_kyc_1', submissionId = 'sub_onb_1') {
  prisma.identitySubmission.findFirst
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce(null);
  prisma.identitySubmission.count.mockResolvedValue(0);
  prisma.identitySubmission.create.mockResolvedValue({
    id: submissionId,
    accountApplicationId: applicationId,
    userId: null,
    status: 'DRAFT',
    artifacts: [],
  });
  prisma.identitySubmissionArtifact.findFirst.mockResolvedValue(null);
  prisma.identitySubmissionArtifact.create.mockImplementation(({ data }) =>
    Promise.resolve({ ...data })
  );
  prisma.identitySubmission.update.mockResolvedValue({
    id: submissionId,
    status: 'PENDING_UPLOADS',
  });
}

describe('Onboarding KYC /api/onboarding/kyc (Fatia 2)', () => {
  const originalOnboardingFlag = process.env.ONBOARDING_APPLICATION_ENABLED;

  beforeAll(() => {
    process.env.ONBOARDING_APPLICATION_ENABLED = 'true';
    process.env.FEATURE_KYC_ENABLED = 'true';
    process.env.KYC_STORAGE_BUCKET = 'test-kyc-bucket';
    process.env.KYC_STORAGE_ACCESS_KEY_ID = 'kid';
    process.env.KYC_STORAGE_SECRET_ACCESS_KEY = 'secret';
  });

  afterAll(() => {
    process.env.ONBOARDING_APPLICATION_ENABLED = originalOnboardingFlag;
  });

  beforeEach(() => {
    delete process.env.FEATURE_KYC_REQUIRE_FACE_VIDEO;
    prisma.$transaction.mockImplementation(async (cb) => cb(prisma));
    prisma.onboardingSession.findUnique.mockReset();
    prisma.onboardingSession.update.mockReset();
    prisma.identitySubmission.findFirst.mockReset();
    prisma.identitySubmission.findUnique.mockReset();
    prisma.identitySubmission.create.mockReset();
    prisma.identitySubmission.update.mockReset();
    prisma.identitySubmission.count.mockReset();
    prisma.identitySubmissionArtifact.findFirst.mockReset();
    prisma.identitySubmissionArtifact.create.mockReset();
    prisma.identitySubmissionArtifact.update.mockReset();
    prisma.identitySubmissionArtifact.deleteMany.mockReset();
    prisma.accountApplication.update.mockReset();
    prisma.user.create.mockReset();
    identityStorage.isIdentityStorageFeatureFlagOn.mockReturnValue(true);
    identityStorage.createPresignedUploadUrl.mockResolvedValue({
      url: 'https://bucket.s3.amazonaws.com/key?X-Amz-Signature=abc',
      expiresAt: '2099-01-01T00:00:00.000Z',
      ttlSeconds: 900,
    });
    identityStorage.headIdentityObjectMetadata.mockResolvedValue({
      contentLength: 2048,
      contentType: 'image/jpeg',
    });
  });

  it('GET /kyc/status sem cookie retorna 401', async () => {
    const res = await request(app).get('/api/onboarding/kyc/status');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('ONBOARDING_SESSION_REQUIRED');
  });

  it('GET /kyc/status com cookie válida retorna status público', async () => {
    prisma.identitySubmission.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/onboarding/kyc/status')
      .set('Cookie', sessionCookie());

    expect(res.status).toBe(200);
    expect(res.body.data.applicationId).toBe('app_kyc_1');
    expect(res.body.data.identityStatus).toBe('NOT_STARTED');
    expect(res.body.data).not.toHaveProperty('objectKey');
    expect(res.body.data).not.toHaveProperty('uploadUrl');
    expect(res.body.data).not.toHaveProperty('cpf');
  });

  it('POST presign sem cookie retorna 401', async () => {
    const res = await request(app).post('/api/onboarding/kyc/presign').send({
      artifactType: 'DOCUMENT_FRONT',
      mimeType: 'image/jpeg',
      byteSize: 1024,
    });
    expect(res.status).toBe(401);
  });

  it('presign com artifact inválido retorna 400', async () => {
    const res = await request(app)
      .post('/api/onboarding/kyc/presign')
      .set('Cookie', sessionCookie())
      .send({
        artifactType: 'INVALID_TYPE',
        mimeType: 'image/jpeg',
        byteSize: 1024,
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('presign DOCUMENT_FRONT funciona', async () => {
    wirePresignHappyPath();

    const res = await request(app)
      .post('/api/onboarding/kyc/presign')
      .set('Cookie', sessionCookie())
      .send({
        artifactType: 'DOCUMENT_FRONT',
        mimeType: 'image/jpeg',
        byteSize: 1024,
      });

    expect(res.status).toBe(200);
    expect(res.body.data.artifactId).toBeTruthy();
    expect(res.body.data.uploadUrl).toBeTruthy();
    expect(res.body.data).not.toHaveProperty('submissionId');
    expect(prisma.user.create).not.toHaveBeenCalled();

    const createArg = prisma.identitySubmission.create.mock.calls[0][0];
    expect(createArg.data.accountApplicationId).toBe('app_kyc_1');
    expect(createArg.data.userId).toBeUndefined();
  });

  it('presign SELFIE_PORTRAIT funciona', async () => {
    wirePresignHappyPath();

    const res = await request(app)
      .post('/api/onboarding/kyc/presign')
      .set('Cookie', sessionCookie())
      .send({
        artifactType: 'SELFIE_PORTRAIT',
        mimeType: 'image/png',
        byteSize: 2048,
      });

    expect(res.status).toBe(200);
    expect(res.body.data.artifactId).toBeTruthy();
  });

  it('FACE_VIDEO aceita video/webm e video/mp4 no presign', async () => {
    process.env.FEATURE_KYC_REQUIRE_FACE_VIDEO = 'true';
    wirePresignHappyPath();

    for (const mimeType of ['video/webm', 'video/mp4']) {
      identityStorage.headIdentityObjectMetadata.mockResolvedValue({
        contentLength: 5000,
        contentType: mimeType,
      });
      const res = await request(app)
        .post('/api/onboarding/kyc/presign')
        .set('Cookie', sessionCookie(`face_video_${mimeType.replace('/', '_')}`))
        .send({
          artifactType: 'FACE_VIDEO',
          mimeType,
          byteSize: 5000,
        });
      expect(res.status).toBe(200);
      expect(res.body.data.uploadUrl).toBeTruthy();
    }
  });

  it('confirm-upload exige objeto existente no storage (HEAD)', async () => {
    const err = new Error('Objeto não encontrado');
    err.code = 'UPLOAD_OBJECT_NOT_FOUND';
    err.statusCode = 404;
    identityStorage.headIdentityObjectMetadata.mockRejectedValue(err);

    prisma.identitySubmissionArtifact.findFirst.mockResolvedValue({
      id: 'art_missing',
      uploadStatus: 'AWAITING_UPLOAD',
      bucket: 'test-kyc-bucket',
      objectKey: 'identity/sub1/art_missing.webm',
      byteSize: 100,
      mimeType: 'video/webm',
      submission: { accountApplicationId: 'app_kyc_1', userId: null },
    });

    const res = await request(app)
      .post('/api/onboarding/kyc/confirm-upload')
      .set('Cookie', sessionCookie())
      .send({ artifactId: 'art_missing' });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('UPLOAD_OBJECT_NOT_FOUND');
    expect(prisma.identitySubmissionArtifact.update).not.toHaveBeenCalled();
  });

  it('submit sem todos os artefatos retorna erro público', async () => {
    prisma.identitySubmission.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'sub_partial',
        accountApplicationId: 'app_kyc_1',
        userId: null,
        status: 'PENDING_UPLOADS',
        artifacts: [
          { type: 'DOCUMENT_FRONT', uploadStatus: 'UPLOAD_CONFIRMED' },
          { type: 'DOCUMENT_BACK', uploadStatus: 'UPLOAD_CONFIRMED' },
        ],
      });

    const res = await request(app)
      .post('/api/onboarding/kyc/submit')
      .set('Cookie', sessionCookie())
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('IDENTITY_MISSING_ARTIFACTS');
    expect(res.body.message).toMatch(/selfie/i);
  });

  it('com FEATURE_KYC_REQUIRE_FACE_VIDEO=false, submit exige 3 artefatos', async () => {
    process.env.FEATURE_KYC_REQUIRE_FACE_VIDEO = 'false';
    prisma.identitySubmission.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'sub_three',
        accountApplicationId: 'app_kyc_1',
        userId: null,
        status: 'PENDING_UPLOADS',
        artifacts: [
          { type: 'DOCUMENT_FRONT', uploadStatus: 'UPLOAD_CONFIRMED' },
          { type: 'DOCUMENT_BACK', uploadStatus: 'UPLOAD_CONFIRMED' },
          { type: 'SELFIE_PORTRAIT', uploadStatus: 'UPLOAD_CONFIRMED' },
        ],
      });
    prisma.identitySubmission.update.mockResolvedValue({
      id: 'sub_three',
      status: 'READY_FOR_REVIEW',
    });
    prisma.accountApplication.update.mockResolvedValue({
      id: 'app_kyc_1',
      status: 'DOCUMENTS_PENDING',
    });

    const res = await request(app)
      .post('/api/onboarding/kyc/submit')
      .set('Cookie', sessionCookie())
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.data.identityStatus).toBe('READY_FOR_REVIEW');
    expect(res.body.data.applicationStatus).toBe('DOCUMENTS_PENDING');
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('com FEATURE_KYC_REQUIRE_FACE_VIDEO=true, submit exige FACE_VIDEO também', async () => {
    process.env.FEATURE_KYC_REQUIRE_FACE_VIDEO = 'true';

    prisma.identitySubmission.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'sub_no_video',
        accountApplicationId: 'app_kyc_1',
        userId: null,
        status: 'PENDING_UPLOADS',
        artifacts: [
          { type: 'DOCUMENT_FRONT', uploadStatus: 'UPLOAD_CONFIRMED' },
          { type: 'DOCUMENT_BACK', uploadStatus: 'UPLOAD_CONFIRMED' },
          { type: 'SELFIE_PORTRAIT', uploadStatus: 'UPLOAD_CONFIRMED' },
        ],
      });

    const res = await request(app)
      .post('/api/onboarding/kyc/submit')
      .set('Cookie', sessionCookie())
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('IDENTITY_MISSING_ARTIFACTS');
    expect(res.body.message).toMatch(/vídeo facial/i);
  });

  it('submit completo altera status para revisão e DOCUMENTS_PENDING', async () => {
    process.env.FEATURE_KYC_REQUIRE_FACE_VIDEO = 'false';
    prisma.identitySubmission.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'sub_full',
        accountApplicationId: 'app_kyc_1',
        userId: null,
        status: 'PENDING_UPLOADS',
        artifacts: [
          { type: 'DOCUMENT_FRONT', uploadStatus: 'UPLOAD_CONFIRMED' },
          { type: 'DOCUMENT_BACK', uploadStatus: 'UPLOAD_CONFIRMED' },
          { type: 'SELFIE_PORTRAIT', uploadStatus: 'UPLOAD_CONFIRMED' },
        ],
      });
    prisma.identitySubmission.update.mockResolvedValue({
      id: 'sub_full',
      status: 'READY_FOR_REVIEW',
    });
    prisma.accountApplication.update.mockResolvedValue({
      id: 'app_kyc_1',
      status: 'DOCUMENTS_PENDING',
    });

    const res = await request(app)
      .post('/api/onboarding/kyc/submit')
      .set('Cookie', sessionCookie())
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.data.identityStatus).toBe('READY_FOR_REVIEW');
    expect(prisma.accountApplication.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'app_kyc_1' },
        data: { status: 'DOCUMENTS_PENDING' },
      })
    );
  });

  it('cookie de onboarding não autentica /api/me/kyc-status', async () => {
    const res = await request(app)
      .get('/api/me/kyc-status')
      .set('Cookie', sessionCookie());

    expect(res.status).toBe(401);
  });

  it('não altera contrato de /api/me/kyc/presign (exige JWT)', async () => {
    const res = await request(app).post('/api/me/kyc/presign').send({
      artifactType: 'DOCUMENT_FRONT',
      mimeType: 'image/jpeg',
      byteSize: 1024,
    });
    expect(res.status).toBe(401);
  });
});
