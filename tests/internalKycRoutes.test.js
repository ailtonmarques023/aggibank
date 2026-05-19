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
    createPresignedReadUrl: jest.fn(),
  };
});

const KEY = 'test-internal-kyc-key';
const hdr = () => ({ 'x-internal-key': KEY });

describe('Internal KYC /api/internal/kyc (Fatia 7)', () => {
  beforeAll(() => {
    process.env.INTERNAL_KYC_KEY = KEY;
    process.env.FEATURE_KYC_ENABLED = 'true';
  });

  beforeEach(() => {
    prisma.$transaction.mockImplementation(async (cb) => cb(prisma));
    prisma.identitySubmission.findMany.mockReset();
    prisma.identitySubmission.findUnique.mockReset();
    prisma.identitySubmission.update.mockReset();
    prisma.user.update.mockReset();
    prisma.identitySubmissionArtifact.findUnique.mockReset();
    identityStorage.createPresignedReadUrl.mockReset();
    identityStorage.isIdentityStorageFeatureFlagOn.mockReturnValue(true);
    logger.info.mockClear();
  });

  it('retorna 503 quando INTERNAL_KYC_KEY não está definido', async () => {
    const prev = process.env.INTERNAL_KYC_KEY;
    delete process.env.INTERNAL_KYC_KEY;
    const res = await request(app)
      .get('/api/internal/kyc/submissions')
      .query({ status: 'READY_FOR_REVIEW' })
      .set('x-internal-key', 'any-key');
    process.env.INTERNAL_KYC_KEY = prev;
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('INTERNAL_OPERATION_UNAVAILABLE');
  });

  it('sem header ou chave incorreta retorna 403', async () => {
    const missing = await request(app)
      .get('/api/internal/kyc/submissions')
      .query({ status: 'READY_FOR_REVIEW' });
    expect(missing.status).toBe(403);

    const bad = await request(app)
      .get('/api/internal/kyc/submissions')
      .query({ status: 'READY_FOR_REVIEW' })
      .set({ 'x-internal-key': 'wrong' });
    expect(bad.status).toBe(403);
  });

  it('lista apenas submissions filtradas por query status', async () => {
    prisma.identitySubmission.findMany.mockResolvedValue([
      {
        id: 's1',
        userId: 'u1',
        status: 'READY_FOR_REVIEW',
        versionOrAttempt: 1,
        createdAt: new Date('2026-05-01T10:00:00Z'),
        updatedAt: new Date('2026-05-01T10:00:00Z'),
        submittedForReviewAt: new Date('2026-05-01T11:00:00Z'),
        decidedAt: null,
      },
    ]);

    const res = await request(app)
      .get('/api/internal/kyc/submissions')
      .query({ status: 'READY_FOR_REVIEW' })
      .set(hdr());

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.items).toHaveLength(1);
    expect(prisma.identitySubmission.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'READY_FOR_REVIEW' }),
      })
    );

    const rej = await request(app)
      .get('/api/internal/kyc/submissions')
      .query({ status: 'REJECTED' })
      .set(hdr());
    expect(rej.status).toBe(200);
    expect(prisma.identitySubmission.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'REJECTED' }),
      })
    );
  });

  it('aprovar atualiza submission e User denormalizado', async () => {
    let subRow = {
      id: 'sub-approve',
      userId: 'user-approve',
      status: 'READY_FOR_REVIEW',
      versionOrAttempt: 1,
      submittedForReviewAt: new Date(),
      decidedAt: null,
      decisionActorType: null,
      decisionActorId: null,
      rejectReasonCode: null,
      userFacingMessageSanitized: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    prisma.identitySubmission.findUnique.mockImplementation((args) => {
      const hasArtifacts = !!(args.include && args.include.artifacts);
      if (hasArtifacts) {
        return Promise.resolve({ ...subRow, artifacts: [] });
      }
      return Promise.resolve(subRow);
    });

    prisma.identitySubmission.update.mockImplementation(({ data }) => {
      subRow = { ...subRow, ...data };
      return Promise.resolve(subRow);
    });
    prisma.user.update.mockResolvedValue({});

    const res = await request(app)
      .post('/api/internal/kyc/submissions/sub-approve/decision')
      .set(hdr())
      .send({
        resolution: 'APPROVED',
        operatorReference: 'dashboard:op-a',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.submission.status).toBe('APPROVED');
    expect(prisma.identitySubmission.update).toHaveBeenCalled();
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-approve' },
      data: expect.objectContaining({
        identityReviewStatus: 'APPROVED',
        lastIdentitySubmissionId: 'sub-approve',
      }),
    });
  });

  it('reprovar persiste rejectReasonCode e mensagem sanitizada', async () => {
    let subRow = {
      id: 'sub-r',
      userId: 'u-r',
      status: 'UNDER_MANUAL_REVIEW',
      versionOrAttempt: 1,
      submittedForReviewAt: new Date(),
      decidedAt: null,
      decisionActorType: null,
      decisionActorId: null,
      rejectReasonCode: null,
      userFacingMessageSanitized: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    prisma.identitySubmission.findUnique.mockImplementation((args) => {
      const hasArtifacts = !!(args.include && args.include.artifacts);
      if (hasArtifacts) {
        return Promise.resolve({ ...subRow, artifacts: [] });
      }
      return Promise.resolve(subRow);
    });
    prisma.identitySubmission.update.mockImplementation(({ data }) => {
      subRow = { ...subRow, ...data };
      return Promise.resolve(subRow);
    });
    prisma.user.update.mockResolvedValue({});

    const res = await request(app)
      .post('/api/internal/kyc/submissions/sub-r/decision')
      .set(hdr())
      .send({
        resolution: 'REJECTED',
        operatorReference: 'ref-op',
        rejectReasonCode: 'DOC_ILLEGIBLE',
        userFacingMessageSanitized: 'Tire foto <bad>nova</bad>',
      });

    expect(res.status).toBe(200);
    expect(res.body.data.submission.status).toBe('REJECTED');
    expect(res.body.data.submission.rejectReasonCode).toBe('DOC_ILLEGIBLE');
    expect(res.body.data.submission.userFacingMessageSanitized).toBe('Tire foto bad nova /bad');
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u-r' },
      data: {
        identityReviewStatus: 'REJECTED_RESUBMISSION',
        identityApprovedAt: null,
      },
    });
  });

  it('RESUBMISSION_REQUIRED marca submission e usuário compatível', async () => {
    let subRow = {
      id: 'sub-rs',
      userId: 'u-rs',
      status: 'READY_FOR_REVIEW',
      versionOrAttempt: 2,
      submittedForReviewAt: new Date(),
      decidedAt: null,
      decisionActorType: null,
      decisionActorId: null,
      rejectReasonCode: null,
      userFacingMessageSanitized: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    prisma.identitySubmission.findUnique.mockImplementation((args) => {
      const hasArtifacts = !!(args.include && args.include.artifacts);
      if (hasArtifacts) return Promise.resolve({ ...subRow, artifacts: [] });
      return Promise.resolve(subRow);
    });
    prisma.identitySubmission.update.mockImplementation(({ data }) => {
      subRow = { ...subRow, ...data };
      return Promise.resolve(subRow);
    });
    prisma.user.update.mockResolvedValue({});

    const res = await request(app)
      .post('/api/internal/kyc/submissions/sub-rs/decision')
      .set(hdr())
      .send({
        resolution: 'RESUBMISSION_REQUIRED',
        operatorReference: 'op-xyz',
        reasonCode: 'GLARE_ON_DOC',
        userFacingMessage: 'Evite reflexo sobre o documento.',
      });

    expect(res.status).toBe(200);
    expect(res.body.data.submission.status).toBe('RESUBMISSION_REQUIRED');
    expect(res.body.data.submission.rejectReasonCode).toBe('GLARE_ON_DOC');
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u-rs' },
      data: {
        identityReviewStatus: 'REJECTED_RESUBMISSION',
        identityApprovedAt: null,
      },
    });
  });

  it('não aprova submission que não está READY_FOR_REVIEW nem UNDER_MANUAL_REVIEW', async () => {
    prisma.identitySubmission.findUnique.mockImplementation((args) => {
      if (args.include && args.include.artifacts) {
        return Promise.resolve(null);
      }
      return Promise.resolve({
        id: 'bad',
        userId: 'u-bad',
        status: 'DRAFT',
      });
    });

    const res = await request(app)
      .post('/api/internal/kyc/submissions/bad/decision')
      .set(hdr())
      .send({ resolution: 'APPROVED', operatorReference: 'x' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('INVALID_SUBMISSION_STATE');
  });

  it('read-url não vaza signed URL nos logs identity_storage_service', async () => {
    prisma.identitySubmissionArtifact.findUnique.mockResolvedValue({
      id: 'art1',
      objectKey: 'identity/sub1/artifact1',
      uploadStatus: 'UPLOAD_CONFIRMED',
      submission: { status: 'READY_FOR_REVIEW' },
    });
    identityStorage.createPresignedReadUrl.mockImplementation(async ({ objectKey }) => {
      logger.info(
        {
          category: 'operational_audit',
          component: 'identity_storage_service',
          op: 'presign_get',
          bucket: 'test-bucket',
          objectKeySuffixLength: String(objectKey || '').length,
          ttlSeconds: 900,
        },
        'identity_storage_presign_get_issued'
      );
      return {
        url: 'https://bucket.s3.amazonaws.com/k?X-Amz-Signature=supersecretLeak&CrazySigned=1',
        expiresAt: '2099-01-01T00:00:00.000Z',
        ttlSeconds: 900,
      };
    });

    const res = await request(app)
      .post('/api/internal/kyc/artifacts/art1/read-url')
      .set(hdr());

    expect(res.status).toBe(200);
    expect(res.body.data.url).toContain('X-Amz-Signature');

    const storageLogs = logger.info.mock.calls.filter(
      ([meta]) =>
        meta && meta.component === 'identity_storage_service' && meta.op === 'presign_get'
    );
    expect(storageLogs.length).toBeGreaterThanOrEqual(1);
    storageLogs.forEach((call) => {
      const blob = JSON.stringify(call);
      expect(blob).not.toMatch(/X-Amz-Signature/i);
      expect(blob).not.toMatch(/amazonaws\.com/i);
      expect(blob).not.toContain('supersecretLeak');
    });
  });

  it('detail GET não inclui objectKey bruto nos artefatos', async () => {
    prisma.identitySubmission.findUnique.mockResolvedValue({
      id: 's-det',
      userId: 'u-det',
      status: 'READY_FOR_REVIEW',
      versionOrAttempt: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      submittedForReviewAt: new Date(),
      decidedAt: null,
      decisionActorType: null,
      decisionActorId: null,
      rejectReasonCode: null,
      userFacingMessageSanitized: null,
      artifacts: [
        {
          id: 'a1',
          submissionId: 's-det',
          type: 'DOCUMENT_FRONT',
          uploadStatus: 'UPLOAD_CONFIRMED',
          mimeType: 'image/jpeg',
          byteSize: 100,
          objectKey: 'identity/s-det/a1.jpeg',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    });

    const res = await request(app).get('/api/internal/kyc/submissions/s-det').set(hdr());

    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain('identity/s-det');
    expect(res.body.data.artifacts[0]).toMatchObject({
      opaqueKeyLengthChars: expect.any(Number),
      opaqueKeyFingerprint: expect.any(String),
    });
    expect(res.body.data.artifacts[0].objectKey).toBeUndefined();
  });
});
