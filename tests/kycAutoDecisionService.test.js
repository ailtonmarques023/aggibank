'use strict';

jest.mock('../src/utils/auditLog', () => ({
  recordAudit: jest.fn(() => Promise.resolve()),
}));

const { prisma } = require('../src/config/database');
const { recordAudit } = require('../src/utils/auditLog');
const kycAutoDecision = require('../src/services/kycAutoDecisionService');
const internalIdentity = require('../src/services/internalIdentityService');

const VALID_CPF = '52998224725';

function baseSubmission(overrides = {}) {
  return {
    id: 'sub-1',
    userId: 'user-1',
    status: 'READY_FOR_REVIEW',
    versionOrAttempt: 1,
    decidedAt: null,
    submittedForReviewAt: new Date(),
    artifacts: [
      {
        id: 'a1',
        type: 'DOCUMENT_FRONT',
        uploadStatus: 'UPLOAD_CONFIRMED',
        mimeType: 'image/jpeg',
        byteSize: 100_000,
      },
      {
        id: 'a2',
        type: 'DOCUMENT_BACK',
        uploadStatus: 'UPLOAD_CONFIRMED',
        mimeType: 'image/jpeg',
        byteSize: 100_000,
      },
      {
        id: 'a3',
        type: 'SELFIE_PORTRAIT',
        uploadStatus: 'UPLOAD_CONFIRMED',
        mimeType: 'image/jpeg',
        byteSize: 80_000,
      },
    ],
    ...overrides,
  };
}

function baseUser(overrides = {}) {
  return {
    id: 'user-1',
    isVerificado: true,
    cpf: VALID_CPF,
    ...overrides,
  };
}

describe('kycAutoDecisionService', () => {
  const prevEnv = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.FEATURE_KYC_AUTO_DECISION_ENABLED = 'false';
    process.env.FEATURE_KYC_AUTO_DECISION_SHADOW = 'true';
    process.env.FEATURE_KYC_REQUIRE_FACE_VIDEO = 'false';

    prisma.identitySubmission.findUnique.mockReset();
    prisma.user.findUnique.mockReset();
    prisma.identitySubmission.count.mockReset();
    prisma.identitySubmission.updateMany.mockReset();
    prisma.identitySubmission.update.mockReset();
    prisma.user.update.mockReset();

    prisma.identitySubmission.count.mockResolvedValue(0);
  });

  afterAll(() => {
    process.env = prevEnv;
  });

  it('baixo risco recomenda APPROVED em shadow sem aplicar', async () => {
    prisma.identitySubmission.findUnique.mockResolvedValue(baseSubmission());
    prisma.user.findUnique.mockResolvedValue(baseUser());

    const out = await kycAutoDecision.evaluateSubmission('sub-1', {
      shadow: true,
      enabled: false,
      apply: false,
    });

    expect(out.recommendation).toBe('APPROVED');
    expect(out.ruleHits).toEqual([]);
    expect(out.shadow).toBe(true);
    expect(out.applied).toBe(false);
    expect(prisma.identitySubmission.update).not.toHaveBeenCalled();
    expect(prisma.identitySubmission.updateMany).not.toHaveBeenCalled();
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'KYC_AUTO_DECISION',
        metadata: expect.objectContaining({
          outcome: 'APPROVED',
          shadow: true,
          applied: false,
          cpfValid: true,
          emailVerified: true,
        }),
      })
    );
    const meta = recordAudit.mock.calls[0][0].metadata;
    expect(meta).not.toHaveProperty('cpf');
    expect(meta).not.toHaveProperty('email');
  });

  it('CPF inválido recomenda UNDER_MANUAL_REVIEW', async () => {
    prisma.identitySubmission.findUnique.mockResolvedValue(baseSubmission());
    prisma.user.findUnique.mockResolvedValue(baseUser({ cpf: '12345678901' }));

    const out = await kycAutoDecision.evaluateSubmission('sub-1', { shadow: true, apply: false });

    expect(out.recommendation).toBe('UNDER_MANUAL_REVIEW');
    expect(out.ruleHits).toContain('CPF_INVALID');
    expect(out.cpfValid).toBe(false);
  });

  it('e-mail não verificado recomenda UNDER_MANUAL_REVIEW', async () => {
    prisma.identitySubmission.findUnique.mockResolvedValue(baseSubmission());
    prisma.user.findUnique.mockResolvedValue(baseUser({ isVerificado: false }));

    const out = await kycAutoDecision.evaluateSubmission('sub-1', { shadow: true, apply: false });

    expect(out.recommendation).toBe('UNDER_MANUAL_REVIEW');
    expect(out.ruleHits).toContain('EMAIL_NOT_VERIFIED');
    expect(out.emailVerified).toBe(false);
  });

  it('tentativa/rejeição recente recomenda UNDER_MANUAL_REVIEW', async () => {
    prisma.identitySubmission.findUnique.mockResolvedValue(
      baseSubmission({ versionOrAttempt: 2 })
    );
    prisma.user.findUnique.mockResolvedValue(baseUser());
    prisma.identitySubmission.count.mockResolvedValue(1);

    const out = await kycAutoDecision.evaluateSubmission('sub-1', { shadow: true, apply: false });

    expect(out.recommendation).toBe('UNDER_MANUAL_REVIEW');
    expect(out.ruleHits).toEqual(
      expect.arrayContaining(['MULTIPLE_ATTEMPTS', 'RECENT_NEGATIVE_DECISION'])
    );
  });

  it('status não elegível retorna SKIPPED e não altera submission', async () => {
    prisma.identitySubmission.findUnique.mockResolvedValue(
      baseSubmission({ status: 'DRAFT' })
    );
    prisma.user.findUnique.mockResolvedValue(baseUser());

    const out = await kycAutoDecision.evaluateSubmission('sub-1', { shadow: true, apply: false });

    expect(out.recommendation).toBe('SKIPPED');
    expect(out.ruleHits).toContain('STATUS_NOT_READY_FOR_REVIEW');
    expect(out.applied).toBe(false);
    expect(prisma.identitySubmission.updateMany).not.toHaveBeenCalled();
  });

  it('submission já decidida retorna SKIPPED', async () => {
    prisma.identitySubmission.findUnique.mockResolvedValue(
      baseSubmission({ status: 'APPROVED', decidedAt: new Date() })
    );

    const out = await kycAutoDecision.evaluateSubmission('sub-1', { shadow: true, apply: false });

    expect(out.recommendation).toBe('SKIPPED');
    expect(out.ruleHits).toContain('ALREADY_DECIDED');
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('artefatos incompletos recomendam RESUBMISSION_REQUIRED', async () => {
    prisma.identitySubmission.findUnique.mockResolvedValue(
      baseSubmission({
        artifacts: baseSubmission().artifacts.filter((a) => a.type !== 'SELFIE_PORTRAIT'),
      })
    );
    prisma.user.findUnique.mockResolvedValue(baseUser());

    const out = await kycAutoDecision.evaluateSubmission('sub-1', { shadow: true, apply: false });

    expect(out.recommendation).toBe('RESUBMISSION_REQUIRED');
    expect(out.ruleHits).toContain('ARTIFACTS_INCOMPLETE');
  });

  it('REJECTED automático não existe nas recomendações', () => {
    expect(kycAutoDecision.ALLOWED_RECOMMENDATIONS).not.toContain('REJECTED');
  });

  it('com apply habilitado move para UNDER_MANUAL_REVIEW quando CPF inválido', async () => {
    prisma.identitySubmission.findUnique.mockImplementation(async (args) => {
      if (args.include && args.include.artifacts) {
        return { ...baseSubmission(), artifacts: baseSubmission().artifacts };
      }
      return baseSubmission();
    });
    prisma.user.findUnique.mockResolvedValue(baseUser({ cpf: '11111111111' }));
    prisma.identitySubmission.updateMany.mockResolvedValue({ count: 1 });

    const queueSpy = jest
      .spyOn(internalIdentity, 'queueSubmissionForManualReview')
      .mockResolvedValue({
        applied: true,
        submission: { id: 'sub-1', status: 'UNDER_MANUAL_REVIEW' },
        reason: 'QUEUED',
      });

    const out = await kycAutoDecision.evaluateSubmission('sub-1', {
      shadow: false,
      enabled: true,
      apply: true,
    });

    expect(out.recommendation).toBe('UNDER_MANUAL_REVIEW');
    expect(queueSpy).toHaveBeenCalled();
    expect(out.applied).toBe(true);

    queueSpy.mockRestore();
  });
});
