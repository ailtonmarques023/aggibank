'use strict';

const request = require('supertest');
const app = require('../src/server');
const { prisma } = require('../src/config/database');
const { hashSessionSecret } = require('../src/services/onboardingSessionService');

jest.mock('../src/utils/email', () => ({
  sendEmail: jest.fn(() => Promise.resolve({ id: 'mock-email' })),
}));

const { sendEmail } = require('../src/utils/email');

function approvedApplicationRow(overrides = {}) {
  const future = new Date(Date.now() + 60 * 60 * 1000);
  return {
    id: 'app_finalize_1',
    status: 'DOCUMENTS_APPROVED',
    protocolNumber: 'APP-FIN001',
    tokenHash: 'a'.repeat(64),
    tokenExpiresAt: future,
    expiresAt: future,
    userId: null,
    nomeCompleto: 'Maria Finalize',
    email: 'maria.finalize@example.com',
    cpf: '52998224725',
    telefone: '11999990000',
    dataNascimento: new Date('1990-01-15'),
    senhaHash: '$2a$12$hashedpasswordmockvalue',
    aceitaTermos: false,
    aceitaComunicacoes: false,
    enderecoJson: {
      cep: '01310100',
      logradouro: 'Av Paulista',
      numero: '1000',
      bairro: 'Bela Vista',
      cidade: 'São Paulo',
      estado: 'SP',
    },
    dadosProfissionaisJson: {
      profissao: 'Engenheira',
      empresa: 'Agil',
    },
    finalizedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function wireSession(secret = 'finalize_session_secret', application = approvedApplicationRow()) {
  prisma.onboardingSession.findUnique.mockResolvedValue({
    id: 'sess_fin',
    applicationId: application.id,
    sessionHash: hashSessionSecret(secret),
    status: 'ACTIVE',
    expiresAt: new Date(Date.now() + 3600000),
    application,
  });
  prisma.onboardingSession.update.mockResolvedValue({});
  prisma.onboardingSession.updateMany.mockResolvedValue({ count: 1 });
  return `agilbank_onboarding_session=${secret}`;
}

const finalizeBody = {
  acceptedTerms: true,
  acceptedPrivacyPolicy: true,
};

describe('Onboarding finalize POST /api/onboarding/finalize (Fatia 4)', () => {
  const originalFlag = process.env.ONBOARDING_APPLICATION_ENABLED;

  beforeAll(() => {
    process.env.ONBOARDING_APPLICATION_ENABLED = 'true';
  });

  afterAll(() => {
    process.env.ONBOARDING_APPLICATION_ENABLED = originalFlag;
  });

  beforeEach(() => {
    sendEmail.mockClear();
    prisma.$transaction.mockImplementation(async (cb) => cb(prisma));
    prisma.onboardingSession.findUnique.mockReset();
    prisma.onboardingSession.update.mockReset();
    prisma.onboardingSession.updateMany.mockReset();
    prisma.accountApplication.update.mockReset();
    prisma.accountApplication.updateMany.mockReset();
    prisma.identitySubmission.findFirst.mockReset();
    prisma.identitySubmission.update.mockReset();
    prisma.user.findUnique.mockReset();
    prisma.user.create.mockReset();
    prisma.user.count.mockReset();
  });

  it('finalize sem cookie retorna 401', async () => {
    const res = await request(app).post('/api/onboarding/finalize').send(finalizeBody);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('ONBOARDING_SESSION_REQUIRED');
  });

  it('finalize com flag desligada retorna 503', async () => {
    process.env.ONBOARDING_APPLICATION_ENABLED = 'false';
    const res = await request(app)
      .post('/api/onboarding/finalize')
      .set('Cookie', wireSession())
      .send(finalizeBody);
    process.env.ONBOARDING_APPLICATION_ENABLED = 'true';
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('ONBOARDING_APPLICATION_DISABLED');
  });

  it('finalize sem acceptedTerms retorna 400', async () => {
    const res = await request(app)
      .post('/api/onboarding/finalize')
      .set('Cookie', wireSession())
      .send({ acceptedPrivacyPolicy: true });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('TERMS_NOT_ACCEPTED');
  });

  it('finalize sem acceptedPrivacyPolicy retorna 400', async () => {
    const res = await request(app)
      .post('/api/onboarding/finalize')
      .set('Cookie', wireSession())
      .send({ acceptedTerms: true });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('PRIVACY_POLICY_NOT_ACCEPTED');
  });

  it('finalize com DRAFT retorna 409', async () => {
    const res = await request(app)
      .post('/api/onboarding/finalize')
      .set('Cookie', wireSession('s_draft', approvedApplicationRow({ status: 'DRAFT' })))
      .send(finalizeBody);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('APPLICATION_NOT_READY');
  });

  it('finalize com DOCUMENTS_PENDING retorna 409', async () => {
    const res = await request(app)
      .post('/api/onboarding/finalize')
      .set(
        'Cookie',
        wireSession('s_pending', approvedApplicationRow({ status: 'DOCUMENTS_PENDING' }))
      )
      .send(finalizeBody);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('DOCUMENTS_NOT_APPROVED');
  });

  it('finalize com RESUBMISSION_REQUIRED retorna 409', async () => {
    const res = await request(app)
      .post('/api/onboarding/finalize')
      .set(
        'Cookie',
        wireSession('s_resub', approvedApplicationRow({ status: 'RESUBMISSION_REQUIRED' }))
      )
      .send(finalizeBody);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('DOCUMENTS_RESUBMISSION_REQUIRED');
  });

  it('finalize com REJECTED retorna 409', async () => {
    const res = await request(app)
      .post('/api/onboarding/finalize')
      .set('Cookie', wireSession('s_rej', approvedApplicationRow({ status: 'REJECTED' })))
      .send(finalizeBody);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('APPLICATION_REJECTED');
  });

  it('finalize sem IdentitySubmission APPROVED retorna 422', async () => {
    prisma.identitySubmission.findFirst.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/onboarding/finalize')
      .set('Cookie', wireSession())
      .send(finalizeBody);

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('IDENTITY_NOT_APPROVED');
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('finalize com DOCUMENTS_APPROVED cria User e estrutura inicial', async () => {
    prisma.identitySubmission.findFirst.mockResolvedValue({
      id: 'sub_app_ok',
      accountApplicationId: 'app_finalize_1',
      status: 'APPROVED',
      userId: null,
    });
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.accountApplication.updateMany.mockResolvedValue({ count: 1 });
    prisma.user.create.mockResolvedValue({
      id: 'user_new_1',
      email: 'maria.finalize@example.com',
      nomeCompleto: 'Maria Finalize',
      numeroConta: '123456',
      digitoConta: '78',
      agencia: '0001',
      tokenVerificacao: 'tok',
      isVerificado: false,
      identityReviewStatus: 'APPROVED',
    });
    prisma.identitySubmission.update.mockResolvedValue({});
    prisma.accountApplication.update.mockResolvedValue({});

    const res = await request(app)
      .post('/api/onboarding/finalize')
      .set('Cookie', wireSession())
      .send(finalizeBody);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.nextStep).toBe('LOGIN');
    expect(res.body).not.toHaveProperty('token');
    expect(res.body).not.toHaveProperty('accessToken');
    expect(JSON.stringify(res.body)).not.toMatch(/Bearer/i);

    const createArg = prisma.user.create.mock.calls[0][0];
    expect(createArg.data.isVerificado).toBe(false);
    expect(createArg.data.identityReviewStatus).toBe('APPROVED');
    expect(createArg.data.identityApprovedAt).toBeInstanceOf(Date);
    expect(createArg.data.lastIdentitySubmissionId).toBe('sub_app_ok');
    expect(createArg.data.endereco).toBeDefined();
    expect(createArg.data.configuracoes).toBeDefined();
    expect(createArg.data.numeroConta).toBeTruthy();
    expect(res.headers['set-cookie']).toBeDefined();
    expect(res.headers['set-cookie'].join(';')).toMatch(/agilbank_onboarding_session=/);
  });

  it('finalize marca AccountApplication FINALIZED e OnboardingSession COMPLETED', async () => {
    prisma.identitySubmission.findFirst.mockResolvedValue({
      id: 'sub_fin',
      status: 'APPROVED',
    });
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.accountApplication.updateMany.mockResolvedValue({ count: 1 });
    prisma.user.create.mockResolvedValue({
      id: 'u_fin',
      email: 'maria.finalize@example.com',
      nomeCompleto: 'Maria',
      numeroConta: '111111',
      digitoConta: '22',
      agencia: '0001',
      tokenVerificacao: 't',
      isVerificado: false,
      identityReviewStatus: 'APPROVED',
    });

    await request(app)
      .post('/api/onboarding/finalize')
      .set('Cookie', wireSession())
      .send(finalizeBody);

    expect(prisma.accountApplication.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'DOCUMENTS_APPROVED' }),
        data: expect.objectContaining({ status: 'FINALIZED' }),
      })
    );
    expect(prisma.onboardingSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: 'COMPLETED' },
      })
    );
  });

  it('retry idempotente não cria User duplicado', async () => {
    const finalized = approvedApplicationRow({
      status: 'FINALIZED',
      userId: 'user_existing',
      finalizedAt: new Date(),
    });
    prisma.user.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/onboarding/finalize')
      .set('Cookie', wireSession('sess_retry', finalized))
      .send(finalizeBody);

    expect(res.status).toBe(200);
    expect(res.body.data.nextStep).toBe('LOGIN');
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('CPF duplicado retorna 409 público', async () => {
    prisma.identitySubmission.findFirst.mockResolvedValue({ id: 'sub', status: 'APPROVED' });
    prisma.user.findUnique.mockImplementation(({ where }) => {
      if (where.cpf) return Promise.resolve({ id: 'other' });
      return Promise.resolve(null);
    });

    const res = await request(app)
      .post('/api/onboarding/finalize')
      .set('Cookie', wireSession())
      .send(finalizeBody);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CPF_ALREADY_EXISTS');
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('e-mail duplicado retorna 409 público', async () => {
    prisma.identitySubmission.findFirst.mockResolvedValue({ id: 'sub', status: 'APPROVED' });
    prisma.user.findUnique.mockImplementation(({ where }) => {
      if (where.email) return Promise.resolve({ id: 'other' });
      return Promise.resolve(null);
    });

    const res = await request(app)
      .post('/api/onboarding/finalize')
      .set('Cookie', wireSession())
      .send(finalizeBody);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('EMAIL_ALREADY_EXISTS');
  });

  it('/api/me/kyc-status continua exigindo JWT', async () => {
    const res = await request(app)
      .get('/api/me/kyc-status')
      .set('Cookie', wireSession());
    expect(res.status).toBe(401);
  });
});
