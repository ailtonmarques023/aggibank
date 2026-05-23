'use strict';

process.env.ONBOARDING_LINEAR_SUBMIT_ENABLED = 'true';
process.env.FEATURE_KYC_ENABLED = 'true';
process.env.KYC_STORAGE_BUCKET = 'test-bucket';
process.env.KYC_STORAGE_ACCESS_KEY_ID = 'kid';
process.env.KYC_STORAGE_SECRET_ACCESS_KEY = 'secret';

const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/server');
const { prisma } = require('../src/config/database');

jest.mock('../src/services/kycAutoDecisionService', () => ({
  isAutoDecisionEnabled: jest.fn(() => false),
  isAutoDecisionShadow: jest.fn(() => true),
  evaluateOnboardingProposalSubmission: jest.fn(() =>
    Promise.resolve({
      recommendation: 'UNDER_MANUAL_REVIEW',
      applied: false,
      ruleHits: [],
    })
  ),
}));

jest.mock('../src/services/onboardingFinalizeService', () => ({
  FINALIZE_PUBLIC_SUCCESS_MESSAGE: 'Conta criada com sucesso. Enviamos um e-mail para confirmar seu cadastro.',
  finalizeOnboardingApplication: jest.fn(),
}));

jest.mock('../src/services/identityStorageService', () => {
  const actual = jest.requireActual('../src/services/identityStorageService');
  return {
    ...actual,
    isIdentityStorageFeatureFlagOn: jest.fn(() => true),
    putObjectBuffer: jest.fn(() =>
      Promise.resolve({ bucket: 'test-bucket', objectKey: 'identity/sub/art/jpeg', byteSize: 100 })
    ),
  };
});

jest.mock('../src/utils/email', () => ({
  sendEmail: jest.fn(() => Promise.resolve({ id: 'mock-email' })),
}));

const identityStorage = require('../src/services/identityStorageService');
const kycAutoDecision = require('../src/services/kycAutoDecisionService');
const onboardingFinalize = require('../src/services/onboardingFinalizeService');

const tinyImage = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

function baseFields(overrides = {}) {
  return {
    cpf: '52998224725',
    dataNascimento: '1990-05-20',
    nome: 'Maria Linear',
    email: 'maria.linear@example.com',
    telefone: '11988887777',
    senha: '123456',
    cep: '01310100',
    rua: 'Av Paulista',
    numero: '1000',
    complemento: '',
    bairro: 'Bela Vista',
    cidade: 'São Paulo',
    estado: 'SP',
    profissao: 'Analista',
    empresa: 'Agil',
    aceitaConsentimentoBiometrico: 'true',
    acceptedTerms: 'true',
    acceptedPrivacyPolicy: 'true',
    aceitaComunicacoes: 'false',
    ...overrides,
  };
}

function attachRequired(req) {
  return req
    .attach('documentFront', tinyImage, { filename: 'front.jpg', contentType: 'image/jpeg' })
    .attach('documentBack', tinyImage, { filename: 'back.jpg', contentType: 'image/jpeg' })
    .attach('selfiePortrait', tinyImage, { filename: 'selfie.jpg', contentType: 'image/jpeg' });
}

function wireSuccessfulSubmitMocks({ appId = 'app_linear_1', subId = 'sub_linear_1' } = {}) {
  prisma.user.findUnique.mockResolvedValue(null);
  prisma.accountApplication.findFirst.mockResolvedValue(null);
  prisma.accountApplication.create.mockResolvedValue({
    id: appId,
    status: 'DATA_RECEIVED',
    protocolNumber: 'APP-LIN001',
    cpf: '52998224725',
    email: 'maria.linear@example.com',
  });
  prisma.identitySubmission.create.mockResolvedValue({
    id: subId,
    accountApplicationId: appId,
    status: 'PENDING_UPLOADS',
    versionOrAttempt: 1,
  });
  prisma.identitySubmissionArtifact.create.mockResolvedValue({});
  prisma.identitySubmission.update.mockResolvedValue({ id: subId, status: 'READY_FOR_REVIEW' });
  prisma.accountApplication.update.mockResolvedValue({
    id: appId,
    status: 'DOCUMENTS_PENDING',
    protocolNumber: 'APP-LIN001',
  });
  prisma.accountApplication.findUnique.mockResolvedValue({
    id: appId,
    status: 'DOCUMENTS_PENDING',
    protocolNumber: 'APP-LIN001',
  });
}

describe('Onboarding linear submit-full', () => {
  const originalLinear = process.env.ONBOARDING_LINEAR_SUBMIT_ENABLED;
  const originalKyc = process.env.FEATURE_KYC_ENABLED;
  const originalAuto = process.env.FEATURE_KYC_AUTO_DECISION_ENABLED;
  const originalShadow = process.env.FEATURE_KYC_AUTO_DECISION_SHADOW;
  const originalVideo = process.env.FEATURE_KYC_REQUIRE_FACE_VIDEO;

  beforeAll(() => {
    process.env.ONBOARDING_LINEAR_SUBMIT_ENABLED = 'true';
    process.env.FEATURE_KYC_ENABLED = 'true';
    process.env.KYC_STORAGE_BUCKET = 'test-bucket';
    process.env.KYC_STORAGE_ACCESS_KEY_ID = 'kid';
    process.env.KYC_STORAGE_SECRET_ACCESS_KEY = 'secret';
    bcrypt.hash.mockImplementation((p) => Promise.resolve(`hashed_${p}`));
    bcrypt.compare.mockImplementation((p, h) => Promise.resolve(h === `hashed_${p}`));
  });

  afterAll(() => {
    process.env.ONBOARDING_LINEAR_SUBMIT_ENABLED = originalLinear;
    process.env.FEATURE_KYC_ENABLED = originalKyc;
    process.env.FEATURE_KYC_AUTO_DECISION_ENABLED = originalAuto;
    process.env.FEATURE_KYC_AUTO_DECISION_SHADOW = originalShadow;
    process.env.FEATURE_KYC_REQUIRE_FACE_VIDEO = originalVideo;
  });

  beforeEach(() => {
    process.env.ONBOARDING_LINEAR_SUBMIT_ENABLED = 'true';
    delete process.env.FEATURE_KYC_REQUIRE_FACE_VIDEO;
    process.env.FEATURE_KYC_AUTO_DECISION_ENABLED = 'false';
    process.env.FEATURE_KYC_AUTO_DECISION_SHADOW = 'true';
    bcrypt.hash.mockImplementation((password) => Promise.resolve(`hashed_${password}`));
    bcrypt.compare.mockImplementation((password, hash) => Promise.resolve(hash === `hashed_${password}`));
    identityStorage.isIdentityStorageFeatureFlagOn.mockReturnValue(true);
    identityStorage.putObjectBuffer.mockResolvedValue({
      bucket: 'test-bucket',
      objectKey: 'identity/sub/art/jpeg',
      byteSize: 100,
    });
    identityStorage.putObjectBuffer.mockClear();
    kycAutoDecision.isAutoDecisionEnabled.mockReturnValue(false);
    kycAutoDecision.isAutoDecisionShadow.mockReturnValue(true);
    kycAutoDecision.evaluateOnboardingProposalSubmission.mockResolvedValue({
      recommendation: 'UNDER_MANUAL_REVIEW',
      applied: false,
      ruleHits: [],
    });
    onboardingFinalize.finalizeOnboardingApplication.mockReset();
    prisma.$transaction.mockImplementation(async (cb) => cb(prisma));
    prisma.accountApplication.create.mockReset();
    prisma.accountApplication.update.mockReset();
    prisma.accountApplication.findUnique.mockReset();
    prisma.accountApplication.findFirst.mockReset();
    prisma.identitySubmission.create.mockReset();
    prisma.identitySubmission.update.mockReset();
    prisma.identitySubmissionArtifact.create.mockReset();
    prisma.user.findUnique.mockReset();
    prisma.user.create.mockReset();
    prisma.identitySubmission.findUnique.mockReset();
    prisma.identitySubmission.findFirst.mockReset();
    prisma.identitySubmission.updateMany.mockReset();
    prisma.accountApplication.updateMany.mockReset();
  });

  it('flag desligada retorna 503', async () => {
    process.env.ONBOARDING_LINEAR_SUBMIT_ENABLED = 'false';
    const res = await request(app).post('/api/onboarding/applications/submit-full');
    process.env.ONBOARDING_LINEAR_SUBMIT_ENABLED = 'true';
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('ONBOARDING_LINEAR_SUBMIT_DISABLED');
  });

  it('submit-full sem termos retorna 400', async () => {
    let req = request(app).post('/api/onboarding/applications/submit-full');
    const fields = baseFields({ acceptedTerms: 'false' });
    Object.entries(fields).forEach(([k, v]) => {
      req = req.field(k, v);
    });
    const res = await attachRequired(req);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('TERMS_NOT_ACCEPTED');
  });

  it('submit-full sem consentimento biométrico retorna 400', async () => {
    let req = request(app).post('/api/onboarding/applications/submit-full');
    const fields = baseFields({ aceitaConsentimentoBiometrico: 'false' });
    Object.entries(fields).forEach(([k, v]) => {
      req = req.field(k, v);
    });
    const res = await attachRequired(req);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('BIOMETRIC_CONSENT_REQUIRED');
  });

  it('submit-full sem documento obrigatório retorna 400', async () => {
    let req = request(app).post('/api/onboarding/applications/submit-full');
    Object.entries(baseFields()).forEach(([k, v]) => {
      req = req.field(k, v);
    });
    const res = await req.attach('documentFront', tinyImage, {
      filename: 'front.jpg',
      contentType: 'image/jpeg',
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('ARTIFACT_REQUIRED');
  });

  it('submit-full com FACE_VIDEO obrigatório e ausente retorna 400', async () => {
    process.env.FEATURE_KYC_REQUIRE_FACE_VIDEO = 'true';
    let req = request(app).post('/api/onboarding/applications/submit-full');
    Object.entries(baseFields()).forEach(([k, v]) => {
      req = req.field(k, v);
    });
    const res = await attachRequired(req);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('ARTIFACT_REQUIRED');
  });

  it('submit-full com dados válidos cria AccountApplication e não retorna JWT', async () => {
    wireSuccessfulSubmitMocks();

    let req = request(app).post('/api/onboarding/applications/submit-full');
    Object.entries(baseFields()).forEach(([k, v]) => {
      req = req.field(k, v);
    });
    const res = await attachRequired(req);

    expect(res.status).toBe(202);
    expect(res.body.success).toBe(true);
    expect(res.body.protocolNumber).toBe('APP-LIN001');
    expect(res.body.status).toBe('WAIT_REVIEW');
    expect(res.body).not.toHaveProperty('token');
    expect(res.body).not.toHaveProperty('jwt');
    expect(prisma.accountApplication.create).toHaveBeenCalled();
    expect(identityStorage.putObjectBuffer).toHaveBeenCalled();
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('CPF duplicado em User retorna 409', async () => {
    prisma.user.findUnique.mockImplementation(({ where }) => {
      if (where.cpf) return Promise.resolve({ id: 'u1' });
      return Promise.resolve(null);
    });

    let req = request(app).post('/api/onboarding/applications/submit-full');
    Object.entries(baseFields()).forEach(([k, v]) => {
      req = req.field(k, v);
    });
    const res = await attachRequired(req);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CPF_ALREADY_EXISTS');
  });

  it('CPF em proposta ativa recente retorna 409', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.accountApplication.findFirst.mockImplementation(({ where }) => {
      if (where.cpf) {
        return Promise.resolve({ id: 'app_active' });
      }
      return Promise.resolve(null);
    });

    let req = request(app).post('/api/onboarding/applications/submit-full');
    Object.entries(baseFields()).forEach(([k, v]) => {
      req = req.field(k, v);
    });
    const res = await attachRequired(req);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('APPLICATION_CPF_ACTIVE');
    expect(prisma.accountApplication.create).not.toHaveBeenCalled();
  });

  describe('AutoDecision hardened', () => {
    beforeEach(() => {
      wireSuccessfulSubmitMocks();
    });

    it('shadow=true: avalia sem apply, não cria User, retorna WAIT_REVIEW', async () => {
      process.env.FEATURE_KYC_AUTO_DECISION_ENABLED = 'true';
      process.env.FEATURE_KYC_AUTO_DECISION_SHADOW = 'true';
      kycAutoDecision.isAutoDecisionEnabled.mockReturnValue(true);
      kycAutoDecision.isAutoDecisionShadow.mockReturnValue(true);
      kycAutoDecision.evaluateOnboardingProposalSubmission.mockResolvedValue({
        recommendation: 'APPROVED',
        applied: false,
        shadow: true,
        enabled: true,
      });

      let req = request(app).post('/api/onboarding/applications/submit-full');
      Object.entries(baseFields()).forEach(([k, v]) => {
        req = req.field(k, v);
      });
      const res = await attachRequired(req);

      expect(res.status).toBe(202);
      expect(res.body.status).toBe('WAIT_REVIEW');
      expect(kycAutoDecision.evaluateOnboardingProposalSubmission).toHaveBeenCalledWith(
        'sub_linear_1',
        expect.objectContaining({
          enabled: true,
          shadow: true,
          apply: false,
        })
      );
      expect(onboardingFinalize.finalizeOnboardingApplication).not.toHaveBeenCalled();
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('APPROVED com apply=true: finaliza conta e retorna FINALIZED/LOGIN sem JWT', async () => {
      process.env.FEATURE_KYC_AUTO_DECISION_ENABLED = 'true';
      process.env.FEATURE_KYC_AUTO_DECISION_SHADOW = 'false';
      kycAutoDecision.isAutoDecisionEnabled.mockReturnValue(true);
      kycAutoDecision.isAutoDecisionShadow.mockReturnValue(false);
      kycAutoDecision.evaluateOnboardingProposalSubmission.mockResolvedValue({
        recommendation: 'APPROVED',
        applied: true,
        shadow: false,
        enabled: true,
      });
      onboardingFinalize.finalizeOnboardingApplication.mockResolvedValue({
        nextStep: 'LOGIN',
        message: 'Conta criada com sucesso. Enviamos um e-mail para confirmar seu cadastro.',
      });
      prisma.accountApplication.findUnique
        .mockResolvedValueOnce({
          id: 'app_linear_1',
          status: 'DOCUMENTS_PENDING',
          protocolNumber: 'APP-LIN001',
        })
        .mockResolvedValueOnce({
          id: 'app_linear_1',
          status: 'FINALIZED',
          protocolNumber: 'APP-LIN001',
          userId: 'user_new_1',
        });

      let req = request(app).post('/api/onboarding/applications/submit-full');
      Object.entries(baseFields()).forEach(([k, v]) => {
        req = req.field(k, v);
      });
      const res = await attachRequired(req);

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('FINALIZED');
      expect(res.body.nextStep).toBe('LOGIN');
      expect(res.body).not.toHaveProperty('jwt');
      expect(kycAutoDecision.evaluateOnboardingProposalSubmission).toHaveBeenCalledWith(
        'sub_linear_1',
        expect.objectContaining({
          enabled: true,
          shadow: false,
          apply: true,
        })
      );
      expect(onboardingFinalize.finalizeOnboardingApplication).toHaveBeenCalled();
    });

    it('UNDER_MANUAL_REVIEW: não cria User e retorna WAIT_REVIEW', async () => {
      process.env.FEATURE_KYC_AUTO_DECISION_ENABLED = 'true';
      kycAutoDecision.isAutoDecisionEnabled.mockReturnValue(true);
      kycAutoDecision.evaluateOnboardingProposalSubmission.mockResolvedValue({
        recommendation: 'UNDER_MANUAL_REVIEW',
        applied: true,
        shadow: false,
        enabled: true,
      });

      let req = request(app).post('/api/onboarding/applications/submit-full');
      Object.entries(baseFields()).forEach(([k, v]) => {
        req = req.field(k, v);
      });
      const res = await attachRequired(req);

      expect(res.status).toBe(202);
      expect(res.body.status).toBe('WAIT_REVIEW');
      expect(onboardingFinalize.finalizeOnboardingApplication).not.toHaveBeenCalled();
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('erro do AutoDecision: não retorna 500, retorna WAIT_REVIEW com proposta criada', async () => {
      process.env.FEATURE_KYC_AUTO_DECISION_ENABLED = 'true';
      kycAutoDecision.isAutoDecisionEnabled.mockReturnValue(true);
      kycAutoDecision.evaluateOnboardingProposalSubmission.mockRejectedValue(
        new Error('motor indisponível')
      );

      let req = request(app).post('/api/onboarding/applications/submit-full');
      Object.entries(baseFields()).forEach(([k, v]) => {
        req = req.field(k, v);
      });
      const res = await attachRequired(req);

      expect(res.status).toBe(202);
      expect(res.body.success).toBe(true);
      expect(res.body.status).toBe('WAIT_REVIEW');
      expect(res.body.protocolNumber).toBe('APP-LIN001');
      expect(prisma.accountApplication.create).toHaveBeenCalled();
      expect(prisma.identitySubmission.create).toHaveBeenCalled();
      expect(onboardingFinalize.finalizeOnboardingApplication).not.toHaveBeenCalled();
    });
  });
});
