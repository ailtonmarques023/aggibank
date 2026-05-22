'use strict';

const fs = require('fs');
const path = require('path');

jest.mock('../src/utils/auditLog', () => ({
  recordAudit: jest.fn(() => Promise.resolve()),
}));

const { prisma } = require('../src/config/database');
const { recordAudit } = require('../src/utils/auditLog');
const kycAutoDecision = require('../src/services/kycAutoDecisionService');
const { KYC_PUBLIC_MESSAGES } = require('../src/constants/kycPublicMessages');
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

  it('regras de abertura de conta não usam score, renda, negativação ou nome sujo', () => {
    const motorSrc = fs.readFileSync(
      path.join(__dirname, '../src/services/kycAutoDecisionService.js'),
      'utf8'
    );
    expect(motorSrc).not.toMatch(/scoreCredito|score.?credito|negativa|renda|nome.?sujo|serasa|spc/i);
    const ruleSrc = fs.readFileSync(path.join(__dirname, '../src/utils/cpfValidation.js'), 'utf8');
    expect(ruleSrc).not.toMatch(/scoreCredito|negativa|renda/i);
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

  describe('Fatia 3 — apply controlado e mensagens públicas', () => {
    it('flags default (env) não aplicam decisão', async () => {
      prisma.identitySubmission.findUnique.mockResolvedValue(baseSubmission());
      prisma.user.findUnique.mockResolvedValue(baseUser());

      const applySpy = jest.spyOn(internalIdentity, 'applySubmissionDecision');
      const queueSpy = jest.spyOn(internalIdentity, 'queueSubmissionForManualReview');

      const out = await kycAutoDecision.evaluateSubmission('sub-1');

      expect(out.applied).toBe(false);
      expect(out.shadow).toBe(true);
      expect(out.enabled).toBe(false);
      expect(applySpy).not.toHaveBeenCalled();
      expect(queueSpy).not.toHaveBeenCalled();

      applySpy.mockRestore();
      queueSpy.mockRestore();
    });

    it('ENABLED=true e SHADOW=false aplica APPROVED em caso limpo', async () => {
      process.env.FEATURE_KYC_AUTO_DECISION_ENABLED = 'true';
      process.env.FEATURE_KYC_AUTO_DECISION_SHADOW = 'false';

      prisma.identitySubmission.findUnique.mockResolvedValue(baseSubmission());
      prisma.user.findUnique.mockResolvedValue(baseUser());

      const applySpy = jest
        .spyOn(internalIdentity, 'applySubmissionDecision')
        .mockResolvedValue({
          submission: { id: 'sub-1', status: 'APPROVED' },
          decision: 'APPROVED',
        });

      const out = await kycAutoDecision.evaluateSubmission('sub-1');

      expect(out.recommendation).toBe('APPROVED');
      expect(out.applied).toBe(true);
      expect(out.shadow).toBe(false);
      expect(applySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          resolution: 'APPROVED',
          decisionActorType: kycAutoDecision.AUTO_ACTOR_TYPE,
        })
      );

      applySpy.mockRestore();
    });

    it('ENABLED=true SHADOW=false aplica RESUBMISSION com mensagem pública apenas', async () => {
      process.env.FEATURE_KYC_AUTO_DECISION_ENABLED = 'true';
      process.env.FEATURE_KYC_AUTO_DECISION_SHADOW = 'false';

      prisma.identitySubmission.findUnique.mockResolvedValue(
        baseSubmission({
          artifacts: baseSubmission().artifacts.map((a) =>
            a.type === 'SELFIE_PORTRAIT' ? { ...a, byteSize: 0 } : a
          ),
        })
      );
      prisma.user.findUnique.mockResolvedValue(baseUser());

      const applySpy = jest
        .spyOn(internalIdentity, 'applySubmissionDecision')
        .mockResolvedValue({
          submission: { id: 'sub-1', status: 'RESUBMISSION_REQUIRED' },
          decision: 'RESUBMISSION_REQUIRED',
        });

      const out = await kycAutoDecision.evaluateSubmission('sub-1');

      expect(out.recommendation).toBe('RESUBMISSION_REQUIRED');
      expect(out.ruleHits).toContain('ARTIFACT_INVALID_SIZE');
      expect(out.applied).toBe(true);
      expect(applySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          resolution: 'RESUBMISSION_REQUIRED',
          userFacingMessage: KYC_PUBLIC_MESSAGES.RESUBMISSION_REQUIRED,
        })
      );
      const msg = applySpy.mock.calls[0][0].userFacingMessage;
      expect(msg).not.toMatch(/antifraude|duplicad|score|renda|negativa|cpf/i);

      applySpy.mockRestore();
    });

    it('anomalia QUARANTINED vai para UNDER_MANUAL_REVIEW, não reenvio automático', async () => {
      prisma.identitySubmission.findUnique.mockResolvedValue(
        baseSubmission({
          artifacts: baseSubmission().artifacts.map((a) =>
            a.type === 'DOCUMENT_FRONT' ? { ...a, uploadStatus: 'QUARANTINED' } : a
          ),
        })
      );
      prisma.user.findUnique.mockResolvedValue(baseUser());

      const out = await kycAutoDecision.evaluateSubmission('sub-1', { shadow: true, apply: false });

      expect(out.recommendation).toBe('UNDER_MANUAL_REVIEW');
      expect(out.ruleHits).toContain('ARTIFACT_QUARANTINED');
    });

    it('ENABLED=true SHADOW=true não aplica mesmo com recomendação APPROVED', async () => {
      process.env.FEATURE_KYC_AUTO_DECISION_ENABLED = 'true';
      process.env.FEATURE_KYC_AUTO_DECISION_SHADOW = 'true';

      prisma.identitySubmission.findUnique.mockResolvedValue(baseSubmission());
      prisma.user.findUnique.mockResolvedValue(baseUser());

      const applySpy = jest.spyOn(internalIdentity, 'applySubmissionDecision');

      const out = await kycAutoDecision.evaluateSubmission('sub-1');

      expect(out.recommendation).toBe('APPROVED');
      expect(out.applied).toBe(false);
      expect(applySpy).not.toHaveBeenCalled();

      applySpy.mockRestore();
    });

    it('audit registra outcome, applied, shadow, ruleHits e trigger', async () => {
      prisma.identitySubmission.findUnique.mockResolvedValue(baseSubmission());
      prisma.user.findUnique.mockResolvedValue(baseUser());

      await kycAutoDecision.evaluateSubmission('sub-1', {
        shadow: true,
        trigger: 'post_submit',
      });

      expect(recordAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            outcome: 'APPROVED',
            applied: false,
            shadow: true,
            enabled: false,
            trigger: 'post_submit',
            ruleHits: expect.any(Array),
          }),
        })
      );
    });
  });
});
