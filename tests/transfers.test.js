'use strict';

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

function mockUserFindForTransfer({ senderSaldo = 5000, recipientSaldo = 100 } = {}) {
  prisma.user.findUnique.mockImplementation((args) => {
    const where = args && args.where ? args.where : {};
    if (where.id === global.testUser.id) {
      const sel = args.select || {};
      if (Object.keys(sel).length === 1 && sel.saldoAtual) {
        return Promise.resolve({ saldoAtual: senderSaldo });
      }
      return Promise.resolve(global.testUser);
    }
    if (where.id === peerUser.id) {
      const sel = args.select || {};
      if (Object.keys(sel).length === 1 && sel.saldoAtual) {
        return Promise.resolve({ saldoAtual: recipientSaldo });
      }
      return Promise.resolve(peerUser);
    }
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

function mockHappyTransferPath() {
  prisma.internalTransfer.findFirst.mockResolvedValueOnce(null);

  prisma.internalTransfer.create.mockResolvedValue({
    id: 'tr-test-1',
    fromUserId: global.testUser.id,
    toUserId: peerUser.id,
    amount: 50,
    status: 'PENDENTE',
    idempotencyKey: 'unit-key-1',
    debitMovementId: null,
    creditMovementId: null,
    description: null,
    createdAt: new Date(),
    completedAt: null,
    failedAt: null,
    failureReason: null,
  });

  let movId = 0;
  prisma.movimentacao.findUnique.mockResolvedValue(null);
  prisma.movimentacao.create.mockImplementation(() => {
    movId += 1;
    return Promise.resolve({ id: `mov-${movId}` });
  });

  prisma.user.update.mockResolvedValue({});

  prisma.internalTransfer.update.mockResolvedValue({
    id: 'tr-test-1',
    fromUserId: global.testUser.id,
    toUserId: peerUser.id,
    amount: 50,
    status: 'CONCLUIDA',
    idempotencyKey: 'unit-key-1',
    debitMovementId: 'mov-1',
    creditMovementId: 'mov-2',
    description: null,
    createdAt: new Date(),
    completedAt: new Date(),
    failedAt: null,
    failureReason: null,
    toUser: {
      id: peerUser.id,
      nomeCompleto: peerUser.nomeCompleto,
      email: peerUser.email,
      numeroConta: peerUser.numeroConta,
      digitoConta: peerUser.digitoConta,
    },
  });

  prisma.$transaction.mockImplementation(async (fn) => fn(prisma));
  prisma.notificacao.findUnique.mockResolvedValue(null);
  prisma.notificacao.create.mockResolvedValue({ id: 'notif-1' });
}

describe('POST /api/transfers/internal', () => {
  beforeEach(() => {
    prisma.user.findUnique.mockResolvedValue(global.testUser);
    mockUserFindForTransfer();
    mockHappyTransferPath();
  });

  it('201 cria transferência e retorna dados públicos', async () => {
    const res = await request(app)
      .post('/api/transfers/internal')
      .set('Authorization', BEARER)
      .set('Idempotency-Key', 'unit-key-1')
      .send({ to: peerUser.email, amount: 50, description: 'Teste' })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.replay).toBe(false);
    expect(res.body.data.transfer.direction).toBe('sent');
    expect(res.body.data.transfer.amount).toBe(50);
    expect(res.body.data.transfer.status).toBe('CONCLUIDA');
    expect(res.body.data.transfer.counterparty).toBeDefined();
    expect(prisma.internalTransfer.create).toHaveBeenCalled();
    expect(prisma.notificacao.create).toHaveBeenCalled();
  });

  it('400 saldo insuficiente', async () => {
    prisma.user.findUnique.mockReset();
    mockUserFindForTransfer({ senderSaldo: 10 });

    prisma.internalTransfer.findFirst.mockResolvedValueOnce(null);
    prisma.$transaction.mockImplementation(async (fn) => fn(prisma));
    prisma.internalTransfer.create.mockResolvedValue({
      id: 'tr-low',
      fromUserId: global.testUser.id,
      toUserId: peerUser.id,
      amount: 50,
      status: 'PENDENTE',
      idempotencyKey: 'k-low',
    });

    const res = await request(app)
      .post('/api/transfers/internal')
      .set('Authorization', BEARER)
      .send({ to: peerUser.email, amount: 50 })
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('INSUFFICIENT_BALANCE');
  });

  it('400 mesma conta', async () => {
    prisma.user.findUnique.mockImplementation((args) => {
      const where = args && args.where ? args.where : {};
      if (where.id === global.testUser.id) return Promise.resolve(global.testUser);
      if (where.email === global.testUser.email.toLowerCase()) {
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

  it('404 destinatário não encontrado', async () => {
    prisma.user.findUnique.mockImplementation((args) => {
      const where = args && args.where ? args.where : {};
      if (where.id === global.testUser.id) return Promise.resolve(global.testUser);
      if (where.email) return Promise.resolve(null);
      return Promise.resolve(null);
    });
    prisma.user.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/transfers/internal')
      .send({ to: 'nope@agilbank.com', amount: 10 })
      .set('Authorization', BEARER)
      .expect(404);

    expect(res.body.code).toBe('RECIPIENT_NOT_FOUND');
  });

  it('400 valor inválido', async () => {
    const res = await request(app)
      .post('/api/transfers/internal')
      .set('Authorization', BEARER)
      .send({ to: peerUser.email, amount: 0.5 })
      .expect(400);

    expect(res.body.code).toBe('INVALID_AMOUNT');
  });

  it('200 idempotência retorna transferência existente sem duplicar notificação obrigatória', async () => {
    const existing = {
      id: 'tr-existing',
      fromUserId: global.testUser.id,
      toUserId: peerUser.id,
      amount: 50,
      status: 'CONCLUIDA',
      idempotencyKey: 'idem-xyz',
      description: null,
      createdAt: new Date(),
      completedAt: new Date(),
      failedAt: null,
      failureReason: null,
      toUser: {
        id: peerUser.id,
        nomeCompleto: peerUser.nomeCompleto,
        email: peerUser.email,
        numeroConta: peerUser.numeroConta,
        digitoConta: peerUser.digitoConta,
      },
    };
    prisma.internalTransfer.findFirst.mockReset();
    prisma.internalTransfer.findFirst.mockResolvedValue(existing);

    const res = await request(app)
      .post('/api/transfers/internal')
      .set('Authorization', BEARER)
      .set('Idempotency-Key', 'idem-xyz')
      .send({ to: peerUser.email, amount: 50 })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.replay).toBe(true);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.notificacao.create).not.toHaveBeenCalled();
  });

  it('409 DUPLICATE_TRANSFER quando colisão e não concluída', async () => {
    mockHappyTransferPath();
    prisma.internalTransfer.create.mockRejectedValueOnce({ code: 'P2002', meta: { target: [] } });
    prisma.internalTransfer.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'tr-pend',
        fromUserId: global.testUser.id,
        toUserId: peerUser.id,
        status: 'PENDENTE',
        idempotencyKey: 'dup-key',
      });

    const res = await request(app)
      .post('/api/transfers/internal')
      .set('Authorization', BEARER)
      .set('Idempotency-Key', 'dup-key')
      .send({ to: peerUser.email, amount: 50 })
      .expect(409);

    expect(res.body.code).toBe('DUPLICATE_TRANSFER');
  });
});

describe('GET /api/transfers', () => {
  it('lista transferências do usuário', async () => {
    prisma.user.findUnique.mockResolvedValue(global.testUser);
    const row = {
      id: 't1',
      fromUserId: global.testUser.id,
      toUserId: peerUser.id,
      amount: 25,
      status: 'CONCLUIDA',
      idempotencyKey: 'k',
      description: null,
      createdAt: new Date(),
      completedAt: new Date(),
      failedAt: null,
      failureReason: null,
      fromUser: global.testUser,
      toUser: peerUser,
    };
    prisma.internalTransfer.findMany.mockResolvedValue([row]);

    const res = await request(app).get('/api/transfers').set('Authorization', BEARER).expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.transfers.length).toBe(1);
    expect(res.body.data.transfers[0].direction).toBe('sent');
  });
});

describe('GET /api/transfers/:id', () => {
  it('404 quando não participa', async () => {
    prisma.user.findUnique.mockResolvedValue(global.testUser);
    prisma.internalTransfer.findFirst.mockResolvedValue(null);

    await request(app)
      .get('/api/transfers/nao-existe')
      .set('Authorization', BEARER)
      .expect(404);
  });

  it('200 quando encontra', async () => {
    prisma.user.findUnique.mockResolvedValue(global.testUser);
    prisma.internalTransfer.findFirst.mockResolvedValue({
      id: 't1',
      fromUserId: global.testUser.id,
      toUserId: peerUser.id,
      amount: 25,
      status: 'CONCLUIDA',
      idempotencyKey: 'k',
      description: null,
      createdAt: new Date(),
      completedAt: new Date(),
      failedAt: null,
      failureReason: null,
      fromUser: global.testUser,
      toUser: peerUser,
    });

    const res = await request(app).get('/api/transfers/t1').set('Authorization', BEARER).expect(200);

    expect(res.body.data.transfer.id).toBe('t1');
  });
});
