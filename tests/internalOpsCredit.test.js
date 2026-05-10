'use strict';

const request = require('supertest');
const app = require('../src/server');
const { prisma } = require('../src/config/database');

const OPS_KEY = 'test-ops-credit-internal-key';

function makeSharedLedgerState(initialSaldo, userId = 'u-credit') {
  return {
    userId,
    userSaldo: initialSaldo,
    movByKey: new Map(),
  };
}

function txFromShared(shared) {
  return {
    movimentacao: {
      findUnique: jest.fn(async ({ where }) => {
        if (!where?.idempotencyKey) return null;
        return shared.movByKey.get(where.idempotencyKey) || null;
      }),
      create: jest.fn(async ({ data }) => {
        const row = { id: `mov-${shared.movByKey.size + 1}`, ...data };
        if (data.idempotencyKey) shared.movByKey.set(data.idempotencyKey, row);
        return row;
      }),
    },
    user: {
      findUnique: jest.fn(async ({ where }) => {
        if (where.id === shared.userId) return { saldoAtual: shared.userSaldo };
        return null;
      }),
      update: jest.fn(async ({ where, data }) => {
        if (where.id === shared.userId && typeof data.saldoAtual === 'number') {
          shared.userSaldo = data.saldoAtual;
        }
        return { id: shared.userId };
      }),
    },
  };
}

describe('POST /api/internal/ops/credit-test-balance', () => {
  let shared;

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    process.env.OPS_CREDIT_INTERNAL_KEY = OPS_KEY;
    shared = makeSharedLedgerState(100, 'u-credit');
    prisma.$transaction.mockImplementation(async (fn) => fn(txFromShared(shared)));
    prisma.user.findUnique.mockImplementation(async ({ where }) => {
      if (where.id === shared.userId) return { saldoAtual: shared.userSaldo };
      return null;
    });
  });

  it('retorna 403 em NODE_ENV=production', async () => {
    process.env.NODE_ENV = 'production';
    const res = await request(app)
      .post('/api/internal/ops/credit-test-balance')
      .set('x-internal-key', OPS_KEY)
      .send({
        userId: 'u-credit',
        valor: 10,
        motivo: 'smoke',
        idempotencyKey: 'idem-prod-block',
        referenciaOperador: 'op-1',
      })
      .expect(403);
    expect(res.body.code).toBe('STAGING_CREDIT_FORBIDDEN_IN_PRODUCTION');
  });

  it('retorna 503 quando OPS_CREDIT_INTERNAL_KEY não está definida', async () => {
    process.env.NODE_ENV = 'test';
    delete process.env.OPS_CREDIT_INTERNAL_KEY;
    const res = await request(app)
      .post('/api/internal/ops/credit-test-balance')
      .set('x-internal-key', 'any')
      .send({
        userId: 'u-credit',
        valor: 10,
        motivo: 'smoke',
        idempotencyKey: 'idem-503',
        referenciaOperador: 'op-1',
      })
      .expect(503);
    expect(res.body.code).toBe('INTERNAL_OPERATION_UNAVAILABLE');
  });

  it('retorna 403 sem x-internal-key correta', async () => {
    const res = await request(app)
      .post('/api/internal/ops/credit-test-balance')
      .set('x-internal-key', 'wrong')
      .send({
        userId: 'u-credit',
        valor: 10,
        motivo: 'smoke',
        idempotencyKey: 'idem-deny',
        referenciaOperador: 'op-1',
      })
      .expect(403);
    expect(res.body.code).toBe('ACCESS_DENIED');
  });

  it('credita com chave válida e retorna movimentacao + saldoAtual', async () => {
    const res = await request(app)
      .post('/api/internal/ops/credit-test-balance')
      .set('x-internal-key', OPS_KEY)
      .send({
        userId: 'u-credit',
        valor: 12.25,
        motivo: 'Cenário homologação',
        idempotencyKey: 'idem-ok-1',
        referenciaOperador: 'op-qa-1',
      })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.movimentacao.valor).toBe(12.25);
    expect(res.body.data.movimentacao.idempotencyKey).toBe('idem-ok-1');
    expect(res.body.data.saldoAtual).toBe(112.25);
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'ops.staging_credit_available',
          entity: 'Movimentacao',
        }),
      }),
    );
  });

  it('segunda chamada com mesma idempotencyKey não altera saldo', async () => {
    await request(app)
      .post('/api/internal/ops/credit-test-balance')
      .set('x-internal-key', OPS_KEY)
      .send({
        userId: 'u-credit',
        valor: 50,
        motivo: 'primeira',
        idempotencyKey: 'idem-dup',
        referenciaOperador: 'op-1',
      })
      .expect(200);

    expect(shared.userSaldo).toBe(150);

    const res2 = await request(app)
      .post('/api/internal/ops/credit-test-balance')
      .set('x-internal-key', OPS_KEY)
      .send({
        userId: 'u-credit',
        valor: 999,
        motivo: 'ignorado',
        idempotencyKey: 'idem-dup',
        referenciaOperador: 'op-2',
      })
      .expect(200);

    expect(shared.userSaldo).toBe(150);
    expect(res2.body.data.movimentacao.valor).toBe(50);
  });

  it('retorna 409 quando idempotencyKey pertence a outro usuário', async () => {
    shared.movByKey.set('idem-conflict', {
      id: 'm-x',
      userId: 'outro-user',
      idempotencyKey: 'idem-conflict',
      valor: 1,
    });

    const res = await request(app)
      .post('/api/internal/ops/credit-test-balance')
      .set('x-internal-key', OPS_KEY)
      .send({
        userId: 'u-credit',
        valor: 10,
        motivo: 'conflito',
        idempotencyKey: 'idem-conflict',
        referenciaOperador: 'op-1',
      })
      .expect(409);

    expect(res.body.code).toBe('LEDGER_IDEMPOTENCY_CONFLICT');
  });
});
