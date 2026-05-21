'use strict';

const request = require('supertest');
const app = require('../src/server');
const { prisma } = require('../src/config/database');
const { hashOnboardingToken } = require('../src/services/accountApplicationService');

describe('Onboarding AccountApplication F1', () => {
  const originalFlag = process.env.ONBOARDING_APPLICATION_ENABLED;

  afterAll(() => {
    process.env.ONBOARDING_APPLICATION_ENABLED = originalFlag;
  });

  describe('feature flag OFF', () => {
    beforeAll(() => {
      process.env.ONBOARDING_APPLICATION_ENABLED = 'false';
    });

    it('POST /api/onboarding/applications retorna 503 controlado', async () => {
      const res = await request(app).post('/api/onboarding/applications').send({});
      expect(res.status).toBe(503);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('ONBOARDING_APPLICATION_DISABLED');
    });

    it('GET /api/onboarding/applications/:id/status retorna 503 controlado', async () => {
      const res = await request(app)
        .get('/api/onboarding/applications/app_test/status')
        .set('X-Onboarding-Token', 'obt_test');
      expect(res.status).toBe(503);
      expect(res.body.code).toBe('ONBOARDING_APPLICATION_DISABLED');
    });
  });

  describe('feature flag ON', () => {
    beforeAll(() => {
      process.env.ONBOARDING_APPLICATION_ENABLED = 'true';
      process.env.ONBOARDING_TOKEN_TTL_SECONDS = '3600';
      process.env.ONBOARDING_APPLICATION_EXPIRES_DAYS = '7';
    });

    beforeEach(() => {
      prisma.accountApplication.create.mockReset();
      prisma.accountApplication.findUnique.mockReset();
      prisma.accountApplication.update.mockReset();
    });

    it('POST cria proposta DRAFT e retorna token obt_* uma vez', async () => {
      prisma.accountApplication.create.mockImplementation(async ({ data }) => ({
        id: 'app_created_1',
        status: data.status,
        protocolNumber: data.protocolNumber,
        tokenHash: data.tokenHash,
        tokenExpiresAt: data.tokenExpiresAt,
        expiresAt: data.expiresAt,
        aceitaTermos: false,
        aceitaComunicacoes: false,
        nomeCompleto: null,
        email: null,
        cpf: null,
        telefone: null,
        dataNascimento: null,
        senhaHash: null,
        enderecoJson: null,
        dadosProfissionaisJson: null,
        createdAt: new Date('2026-05-21T12:00:00.000Z'),
        updatedAt: new Date('2026-05-21T12:00:00.000Z'),
      }));

      const res = await request(app).post('/api/onboarding/applications').send({});

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('DRAFT');
      expect(res.body.data.applicationId).toBe('app_created_1');
      expect(res.body.data.onboardingToken).toMatch(/^obt_/);
      expect(res.body.data.protocolNumber).toMatch(/^APP-/);
      expect(res.body.data).not.toHaveProperty('email');
      expect(res.body.data).not.toHaveProperty('cpf');
      expect(res.body.data).not.toHaveProperty('nomeCompleto');
      expect(prisma.accountApplication.create).toHaveBeenCalledTimes(1);
      const createArg = prisma.accountApplication.create.mock.calls[0][0];
      expect(createArg.data.status).toBe('DRAFT');
      expect(createArg.data.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('GET status exige token de proposta e não expõe PII', async () => {
      const token = 'obt_status_test_token_value';
      const tokenHash = hashOnboardingToken(token);
      const future = new Date(Date.now() + 60 * 60 * 1000);
      const row = {
        id: 'app_status_1',
        status: 'DRAFT',
        protocolNumber: 'APP-ABCDEF',
        tokenHash,
        tokenExpiresAt: future,
        expiresAt: future,
        aceitaTermos: false,
        aceitaComunicacoes: false,
        nomeCompleto: 'Nome Secreto',
        email: 'secreto@example.com',
        cpf: '12345678901',
        telefone: '11999999999',
        dataNascimento: null,
        senhaHash: null,
        enderecoJson: null,
        dadosProfissionaisJson: null,
        createdAt: new Date('2026-05-21T12:00:00.000Z'),
        updatedAt: new Date('2026-05-21T12:00:00.000Z'),
      };

      prisma.accountApplication.findUnique.mockResolvedValue(row);

      const res = await request(app)
        .get('/api/onboarding/applications/app_status_1/status')
        .set('X-Onboarding-Token', token);

      expect(res.status).toBe(200);
      expect(res.body.data.applicationId).toBe('app_status_1');
      expect(res.body.data.status).toBe('DRAFT');
      expect(res.body.data).not.toHaveProperty('email');
      expect(res.body.data).not.toHaveProperty('cpf');
      expect(res.body.data).not.toHaveProperty('nomeCompleto');
      expect(res.body.data.progress.personalDataComplete).toBe(false);
    });

    it('GET status com token errado retorna 403', async () => {
      prisma.accountApplication.findUnique.mockResolvedValue({
        id: 'app_x',
        status: 'DRAFT',
        protocolNumber: 'APP-XYZ',
        tokenHash: hashOnboardingToken('obt_other'),
        tokenExpiresAt: new Date(Date.now() + 3600000),
        expiresAt: new Date(Date.now() + 3600000),
        aceitaTermos: false,
        aceitaComunicacoes: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app)
        .get('/api/onboarding/applications/app_x/status')
        .set('X-Onboarding-Token', 'obt_wrong');

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('ONBOARDING_TOKEN_MISMATCH');
    });

    it('token obt_* não autentica em /api/me/kyc-status', async () => {
      const res = await request(app)
        .get('/api/me/kyc-status')
        .set('Authorization', 'Bearer obt_not_a_user_jwt');

      expect(res.status).toBe(401);
    });
  });
});
