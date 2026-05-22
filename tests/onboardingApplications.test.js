'use strict';

const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/server');
const { prisma } = require('../src/config/database');
const { hashOnboardingToken } = require('../src/services/accountApplicationService');
const { hashSessionSecret } = require('../src/services/onboardingSessionService');
const { parseAllowedCorsOrigins } = require('../src/utils/corsOrigins');

function applicationRow(overrides = {}) {
  const future = new Date(Date.now() + 60 * 60 * 1000);
  return {
    id: 'app_created_1',
    status: 'DRAFT',
    protocolNumber: 'APP-ABCDEF12',
    tokenHash: 'a'.repeat(64),
    tokenExpiresAt: future,
    expiresAt: future,
    aceitaTermos: false,
    aceitaComunicacoes: false,
    nomeCompleto: 'Nome Secreto',
    email: 'secreto@example.com',
    cpf: '52998224725',
    telefone: null,
    dataNascimento: null,
    senhaHash: null,
    enderecoJson: null,
    dadosProfissionaisJson: null,
    createdAt: new Date('2026-05-21T12:00:00.000Z'),
    updatedAt: new Date('2026-05-21T12:00:00.000Z'),
    ...overrides,
  };
}

describe('Onboarding AccountApplication — cookie HTTP-only', () => {
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
      expect(res.body.code).toBe('ONBOARDING_APPLICATION_DISABLED');
    });

    it('GET /api/onboarding/applications/current/status retorna 503 controlado', async () => {
      const res = await request(app).get('/api/onboarding/applications/current/status');
      expect(res.status).toBe(503);
      expect(res.body.code).toBe('ONBOARDING_APPLICATION_DISABLED');
    });
  });

  describe('feature flag ON', () => {
    beforeAll(() => {
      process.env.ONBOARDING_APPLICATION_ENABLED = 'true';
      process.env.ONBOARDING_SESSION_MAX_AGE_SECONDS = '1800';
      process.env.ONBOARDING_APPLICATION_EXPIRES_DAYS = '7';
    });

    beforeEach(() => {
      bcrypt.hash.mockImplementation((password) => Promise.resolve(`hashed_${password}`));
      bcrypt.compare.mockImplementation((password, hash) => Promise.resolve(hash === `hashed_${password}`));
      prisma.accountApplication.create.mockReset();
      prisma.accountApplication.findUnique.mockReset();
      prisma.accountApplication.update.mockReset();
      prisma.onboardingSession.create.mockReset();
      prisma.onboardingSession.findUnique.mockReset();
      prisma.onboardingSession.update.mockReset();
      prisma.user.create.mockReset();
      prisma.user.findUnique.mockReset();
    });

    it('POST cria proposta, Set-Cookie, sem onboardingToken no JSON', async () => {
      prisma.accountApplication.create.mockImplementation(async ({ data }) =>
        applicationRow({
          protocolNumber: data.protocolNumber,
          tokenHash: data.tokenHash,
          tokenExpiresAt: data.tokenExpiresAt,
          expiresAt: data.expiresAt,
        })
      );
      prisma.onboardingSession.create.mockImplementation(async ({ data }) => ({
        id: 'sess_1',
        applicationId: data.applicationId,
        sessionHash: data.sessionHash,
        status: data.status,
        expiresAt: data.expiresAt,
        lastUsedAt: data.lastUsedAt,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      const res = await request(app).post('/api/onboarding/applications').send({});

      expect(res.status).toBe(201);
      expect(res.body.data.applicationId).toBe('app_created_1');
      expect(res.body.data.nextStep).toBe('PERSONAL_DATA');
      expect(res.body.data).not.toHaveProperty('onboardingToken');
      expect(res.body.data).not.toHaveProperty('email');
      expect(res.body.data).not.toHaveProperty('cpf');
      expect(res.headers['set-cookie']).toBeDefined();
      expect(res.headers['set-cookie'].join(';')).toMatch(/agilbank_onboarding_session=/);
      expect(res.headers['set-cookie'].join(';')).toMatch(/HttpOnly/i);

      const sessionArg = prisma.onboardingSession.create.mock.calls[0][0];
      expect(sessionArg.data.sessionHash).toMatch(/^[a-f0-9]{64}$/);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('GET /current/status sem cookie retorna 401', async () => {
      const res = await request(app).get('/api/onboarding/applications/current/status');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('ONBOARDING_SESSION_REQUIRED');
    });

    it('GET /current/status com cookie inválida retorna 401', async () => {
      prisma.onboardingSession.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .get('/api/onboarding/applications/current/status')
        .set('Cookie', 'agilbank_onboarding_session=invalid_secret_value');

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('ONBOARDING_SESSION_INVALID');
    });

    it('GET /current/status com cookie expirada retorna 401', async () => {
      const secret = 'expired_session_secret_value_xx';
      const past = new Date(Date.now() - 1000);
      prisma.onboardingSession.findUnique.mockResolvedValue({
        id: 'sess_exp',
        applicationId: 'app_created_1',
        sessionHash: hashSessionSecret(secret),
        status: 'ACTIVE',
        expiresAt: past,
        application: applicationRow(),
      });
      prisma.onboardingSession.update.mockResolvedValue({});

      const res = await request(app)
        .get('/api/onboarding/applications/current/status')
        .set('Cookie', `agilbank_onboarding_session=${secret}`);

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('ONBOARDING_SESSION_EXPIRED');
    });

    it('GET /current/status com cookie válida retorna status público', async () => {
      const secret = 'valid_session_secret_for_test_only';
      const row = applicationRow();
      prisma.onboardingSession.findUnique.mockResolvedValue({
        id: 'sess_ok',
        applicationId: row.id,
        sessionHash: hashSessionSecret(secret),
        status: 'ACTIVE',
        expiresAt: new Date(Date.now() + 3600000),
        application: row,
      });
      prisma.onboardingSession.update.mockResolvedValue({});

      const res = await request(app)
        .get('/api/onboarding/applications/current/status')
        .set('Cookie', `agilbank_onboarding_session=${secret}`);

      expect(res.status).toBe(200);
      expect(res.body.data.applicationId).toBe('app_created_1');
      expect(res.body.data.status).toBe('DRAFT');
      expect(res.body.data).not.toHaveProperty('email');
      expect(res.body.data).not.toHaveProperty('cpf');
      expect(res.body.data).not.toHaveProperty('nomeCompleto');
      expect(res.body.data.message).toBeUndefined();
    });

    it('POST /logout revoga sessão e limpa cookie', async () => {
      const secret = 'logout_session_secret_test';
      prisma.onboardingSession.findUnique.mockResolvedValue({
        id: 'sess_logout',
        applicationId: 'app_created_1',
        sessionHash: hashSessionSecret(secret),
        status: 'ACTIVE',
        expiresAt: new Date(Date.now() + 3600000),
        application: applicationRow(),
      });
      prisma.onboardingSession.update.mockResolvedValue({ id: 'sess_logout', status: 'REVOKED' });

      const res = await request(app)
        .post('/api/onboarding/logout')
        .set('Cookie', `agilbank_onboarding_session=${secret}`);

      expect(res.status).toBe(200);
      expect(res.body.data.loggedOut).toBe(true);
      expect(prisma.onboardingSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'sess_logout' },
          data: { status: 'REVOKED' },
        })
      );
      expect(res.headers['set-cookie']).toBeDefined();
      expect(res.headers['set-cookie'].join(';')).toMatch(/agilbank_onboarding_session=/);
    });

    it('criar proposta não cria User nem conta', async () => {
      prisma.accountApplication.create.mockResolvedValue(applicationRow());
      prisma.onboardingSession.create.mockResolvedValue({
        id: 's',
        sessionHash: 'b'.repeat(64),
        status: 'ACTIVE',
        expiresAt: new Date(Date.now() + 1000),
      });

      await request(app).post('/api/onboarding/applications').send({});

      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('cookie de onboarding não autentica /api/me/kyc-status', async () => {
      const res = await request(app)
        .get('/api/me/kyc-status')
        .set('Cookie', 'agilbank_onboarding_session=not_a_jwt');

      expect(res.status).toBe(401);
    });

    function validPatchBody() {
      return {
      nomeCompleto: 'Maria Silva',
      email: 'maria.patch@example.com',
      cpf: '52998224725',
      telefone: '11999999999',
      dataNascimento: '1990-01-15',
      senha: '123456',
      aceitaConsentimentoBiometrico: true,
      endereco: {
        cep: '01310100',
        logradouro: 'Av Paulista',
        numero: '100',
        bairro: 'Bela Vista',
        cidade: 'Sao Paulo',
        estado: 'SP',
      },
      dadosProfissionais: { profissao: 'Engenheira' },
      };
    }

    function draftRowForPatch(overrides = {}) {
      return applicationRow({
        telefone: '11988887777',
        dataNascimento: new Date('1990-01-15'),
        senhaHash: 'hashed_existing',
        enderecoJson: {
          cep: '01310100',
          logradouro: 'Rua Teste',
          numero: '10',
          bairro: 'Centro',
          cidade: 'Sao Paulo',
          estado: 'SP',
        },
        dadosProfissionaisJson: { profissao: 'Analista' },
        ...overrides,
      });
    }

    function mockActiveSession(secret, applicationOverrides = {}) {
      const row = draftRowForPatch(applicationOverrides);
      prisma.onboardingSession.findUnique.mockResolvedValue({
        id: 'sess_patch',
        applicationId: row.id,
        sessionHash: hashSessionSecret(secret),
        status: 'ACTIVE',
        expiresAt: new Date(Date.now() + 3600000),
        application: row,
      });
      prisma.onboardingSession.update.mockResolvedValue({});
      return row;
    }

    it('PATCH /applications/current sem cookie retorna 401', async () => {
      const res = await request(app)
        .patch('/api/onboarding/applications/current')
        .send(validPatchBody());
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('ONBOARDING_SESSION_REQUIRED');
    });

    it('PATCH /applications/current persiste dados e DATA_RECEIVED sem criar User', async () => {
      const secret = 'patch_session_secret_test';
      const row = mockActiveSession(secret, { status: 'DRAFT' });
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.accountApplication.update.mockImplementation(async ({ data }) =>
        applicationRow({
          ...row,
          ...data,
          status: data.status || row.status,
          senhaHash: data.senhaHash || 'hashed',
        })
      );

      const res = await request(app)
        .patch('/api/onboarding/applications/current')
        .set('Cookie', `agilbank_onboarding_session=${secret}`)
        .send(validPatchBody());

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('DATA_RECEIVED');
      expect(res.body.data).not.toHaveProperty('email');
      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(prisma.accountApplication.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: row.id },
          data: expect.objectContaining({
            status: 'DATA_RECEIVED',
            nomeCompleto: 'Maria Silva',
          }),
        })
      );
      const updateArg = prisma.accountApplication.update.mock.calls[0][0];
      expect(updateArg.data.senhaHash).toBeTruthy();
      expect(updateArg.data.senhaHash).not.toBe('123456');
    });

    it('PATCH /applications/current sem consentimento biométrico retorna 400', async () => {
      const secret = 'patch_no_consent_secret';
      mockActiveSession(secret, { status: 'DRAFT' });
      const body = validPatchBody();
      delete body.aceitaConsentimentoBiometrico;

      const res = await request(app)
        .patch('/api/onboarding/applications/current')
        .set('Cookie', `agilbank_onboarding_session=${secret}`)
        .send(body);

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('BIOMETRIC_CONSENT_REQUIRED');
    });

    it('PATCH /applications/current com CPF já cadastrado retorna 409', async () => {
      const secret = 'patch_dup_cpf_secret';
      mockActiveSession(secret, { status: 'DRAFT' });
      prisma.user.findUnique.mockImplementation(async ({ where }) => {
        if (where.cpf) return { id: 'user_existing' };
        return null;
      });

      const res = await request(app)
        .patch('/api/onboarding/applications/current')
        .set('Cookie', `agilbank_onboarding_session=${secret}`)
        .send(validPatchBody());

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('CPF_ALREADY_EXISTS');
    });

    it('PATCH /applications/current em DOCUMENTS_PENDING retorna 409 locked', async () => {
      const secret = 'patch_locked_secret';
      mockActiveSession(secret, { status: 'DOCUMENTS_PENDING' });

      const res = await request(app)
        .patch('/api/onboarding/applications/current')
        .set('Cookie', `agilbank_onboarding_session=${secret}`)
        .send(validPatchBody());

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('APPLICATION_LOCKED');
    });

    it('legado GET :id/status com X-Onboarding-Token ainda funciona', async () => {
      const token = 'obt_legacy_status_token';
      const tokenHash = hashOnboardingToken(token);
      const row = applicationRow({ tokenHash });
      prisma.accountApplication.findUnique.mockResolvedValue(row);

      const res = await request(app)
        .get('/api/onboarding/applications/app_created_1/status')
        .set('X-Onboarding-Token', token);

      expect(res.status).toBe(200);
      expect(res.body.data.applicationId).toBe('app_created_1');
    });
  });

  describe('CORS allowlist', () => {
    it('parseAllowedCorsOrigins não inclui wildcard', () => {
      const prev = process.env.CORS_ORIGIN;
      process.env.CORS_ORIGIN = 'https://app.example.com,*';
      process.env.FRONTEND_URL = 'https://fe.example.com';
      const list = parseAllowedCorsOrigins();
      expect(list).not.toContain('*');
      expect(list).toContain('https://app.example.com');
      expect(list).toContain('https://fe.example.com');
      process.env.CORS_ORIGIN = prev;
    });
  });
});
