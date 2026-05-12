'use strict';

/**
 * Fase W.1 — Smoke seguro: auth, health, validações negativas.
 * Não executa transferência CONCLUIDA nem altera saldo (mocks Prisma).
 */

const request = require('supertest');
const app = require('../src/server');
const { prisma } = require('../src/config/database');

const BEARER = `Bearer ${global.testToken}`;

const peerUser = {
  id: 'peer-user-id',
  email: 'peer@agilbank.com',
  nomeCompleto: 'Peer Silva',
  numeroConta: '999999',
  digitoConta: '1',
};

function mockAuthUserAndPeer() {
  prisma.user.findUnique.mockImplementation((args) => {
    const where = args && args.where ? args.where : {};
    if (where.id === global.testUser.id) return Promise.resolve(global.testUser);
    if (where.email) {
      const e = String(where.email).toLowerCase();
      if (e === peerUser.email) return Promise.resolve(peerUser);
      return Promise.resolve(null);
    }
    return Promise.resolve(null);
  });
  prisma.user.findFirst.mockImplementation((args) => {
    const w = args && args.where ? args.where : {};
    if (w.numeroConta === peerUser.numeroConta && w.digitoConta === peerUser.digitoConta) {
      return Promise.resolve(peerUser);
    }
    return Promise.resolve(null);
  });
}

describe('W.1 GET /api/health', () => {
  it('200 liveness', async () => {
    const res = await request(app).get('/api/health').expect(200);
    expect(res.body.status).toBe('healthy');
    expect(res.body.mode).toBe('liveness');
  });
});

describe('W.1 GET /api/readiness', () => {
  beforeEach(() => {
    prisma.$queryRaw.mockResolvedValue([{ ok: 1 }]);
    prisma.$transaction.mockImplementation(async (fn) => {
      if (typeof fn === 'function') return fn(prisma);
      return undefined;
    });
  });

  it('200 quando probe de banco resolve (mock)', async () => {
    const res = await request(app).get('/api/readiness').expect(200);
    expect(res.body.status).toBe('ready');
    expect(res.body.mode).toBe('readiness');
    expect(res.body.dependencies.database.status).toBe('healthy');
  });
});

describe('W.1 auth sem token (401)', () => {
  it('POST /api/transfers/internal sem Authorization → 401', async () => {
    const res = await request(app)
      .post('/api/transfers/internal')
      .send({ to: peerUser.email, amount: 10 })
      .expect(401);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('TOKEN_REQUIRED');
  });

  it('GET /api/transfers sem Authorization → 401', async () => {
    const res = await request(app).get('/api/transfers').expect(401);
    expect(res.body.code).toBe('TOKEN_REQUIRED');
  });

  it('GET /api/transfers/:id sem Authorization → 401', async () => {
    const res = await request(app).get('/api/transfers/qualquer-id').expect(401);
    expect(res.body.code).toBe('TOKEN_REQUIRED');
  });
});

describe('W.1 validações autenticadas — sem sucesso financeiro (sem CONCLUIDA)', () => {
  beforeEach(() => {
    prisma.user.findUnique.mockResolvedValue(global.testUser);
    mockAuthUserAndPeer();
    prisma.internalTransfer.create.mockClear();
    prisma.$transaction.mockClear();
    prisma.notificacao.create.mockClear();
    prisma.movimentacao.create.mockClear();
  });

  async function expectNoFinancialSideEffects() {
    expect(prisma.internalTransfer.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.movimentacao.create).not.toHaveBeenCalled();
    expect(prisma.notificacao.create).not.toHaveBeenCalled();
  }

  it('amount 0 → 400 INVALID_AMOUNT', async () => {
    const res = await request(app)
      .post('/api/transfers/internal')
      .set('Authorization', BEARER)
      .send({ to: peerUser.email, amount: 0 })
      .expect(400);
    expect(res.body.code).toBe('INVALID_AMOUNT');
    await expectNoFinancialSideEffects();
  });

  it('amount -1 → 400 INVALID_AMOUNT', async () => {
    const res = await request(app)
      .post('/api/transfers/internal')
      .set('Authorization', BEARER)
      .send({ to: peerUser.email, amount: -1 })
      .expect(400);
    expect(res.body.code).toBe('INVALID_AMOUNT');
    await expectNoFinancialSideEffects();
  });

  it('amount 0.001 → 400 INVALID_AMOUNT', async () => {
    const res = await request(app)
      .post('/api/transfers/internal')
      .set('Authorization', BEARER)
      .send({ to: peerUser.email, amount: 0.001 })
      .expect(400);
    expect(res.body.code).toBe('INVALID_AMOUNT');
    await expectNoFinancialSideEffects();
  });

  it('amount 5001 → 400 INVALID_AMOUNT', async () => {
    const res = await request(app)
      .post('/api/transfers/internal')
      .set('Authorization', BEARER)
      .send({ to: peerUser.email, amount: 5001 })
      .expect(400);
    expect(res.body.code).toBe('INVALID_AMOUNT');
    await expectNoFinancialSideEffects();
  });

  it('amount texto inválido → 400 INVALID_AMOUNT', async () => {
    const res = await request(app)
      .post('/api/transfers/internal')
      .set('Authorization', BEARER)
      .send({ to: peerUser.email, amount: 'zebra' })
      .expect(400);
    expect(res.body.code).toBe('INVALID_AMOUNT');
    await expectNoFinancialSideEffects();
  });

  it('destinatário inexistente → 404 RECIPIENT_NOT_FOUND', async () => {
    prisma.user.findUnique.mockImplementation((args) => {
      const where = args && args.where ? args.where : {};
      if (where.id === global.testUser.id) return Promise.resolve(global.testUser);
      if (where.email) return Promise.resolve(null);
      return Promise.resolve(null);
    });
    prisma.user.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/transfers/internal')
      .set('Authorization', BEARER)
      .send({ to: 'ghost-not-found@agilbank.com', amount: 10 })
      .expect(404);

    expect(res.body.code).toBe('RECIPIENT_NOT_FOUND');
    expect(prisma.internalTransfer.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('mesma conta (e-mail do titular) → 400 SAME_ACCOUNT', async () => {
    prisma.user.findUnique.mockImplementation((args) => {
      const where = args && args.where ? args.where : {};
      if (where.id === global.testUser.id) return Promise.resolve(global.testUser);
      if (where.email === String(global.testUser.email || '').toLowerCase()) {
        return Promise.resolve(global.testUser);
      }
      return Promise.resolve(null);
    });
    prisma.user.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/transfers/internal')
      .set('Authorization', BEARER)
      .send({ to: global.testUser.email, amount: 10 })
      .expect(400);

    expect(res.body.code).toBe('SAME_ACCOUNT');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
