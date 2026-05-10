const request = require('supertest');
const app = require('../src/server');
const { prisma } = require('../src/config/database');

const BEARER = `Bearer ${global.testToken}`;

function authUser(overrides = {}) {
  return { ...global.testUser, ...overrides };
}

function pixTransaction(overrides = {}) {
  return {
    id: 'pix-test-id',
    userId: global.testUser.id,
    chavePix: 'destino@agilbank.com',
    valor: 25.5,
    descricao: 'Teste Pix',
    status: 'processada',
    tipo: 'envio',
    idempotencyKey: 'pix-key-12345',
    dataTransacao: new Date('2026-05-05T14:00:00.000Z'),
    createdAt: new Date('2026-05-05T14:00:00.000Z'),
    ...overrides,
  };
}

describe('PIX API — idempotência no envio', () => {
  beforeEach(() => {
    prisma.user.findUnique.mockResolvedValue(authUser({
      saldoAtual: 1000,
      limitePixDiario: 1000,
      limitePixMensal: 10000,
      isVerificado: true,
    }));

    prisma.transacaoPix.findUnique.mockResolvedValue(null);
    prisma.transacaoPix.aggregate.mockResolvedValue({ _sum: { valor: 0 } });
    prisma.transacaoPix.create.mockImplementation(async ({ data }) => pixTransaction(data));
    prisma.user.update.mockResolvedValue(authUser({ saldoAtual: 974.5 }));
    prisma.movimentacao.create.mockResolvedValue({});
    prisma.$transaction.mockImplementation(async (callback) => callback(prisma));
  });

  it('envia PIX novo salvando a chave de idempotência na transação e movimentação', async () => {
    const res = await request(app)
      .post('/api/pix/send')
      .set('Authorization', BEARER)
      .set('Idempotency-Key', 'pix-key-12345')
      .send({
        chavePix: 'destino@agilbank.com',
        valor: 25.5,
        descricao: 'Teste Pix',
      })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.transacao.idempotencyKey).toBe('pix-key-12345');
    expect(res.body.data.idempotent).toBeUndefined();

    expect(prisma.transacaoPix.create).toHaveBeenCalledTimes(1);
    expect(prisma.transacaoPix.create.mock.calls[0][0].data.idempotencyKey).toBe('pix-key-12345');
    expect(prisma.movimentacao.create).toHaveBeenCalledTimes(1);
    expect(prisma.movimentacao.create.mock.calls[0][0].data).toEqual(
      expect.objectContaining({
        idempotencyKey: 'pix-key-12345',
        tipo: 'pix',
        valor: -25.5,
        saldoAnterior: 1000,
        saldoAtual: 974.5,
        referenceType: 'pix',
        categoria: 'transferencia',
      }),
    );
    expect(prisma.user.update).toHaveBeenCalledTimes(1);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: global.testUser.id },
      data: { saldoAtual: 974.5 },
    });
  });

  it('retorna transação existente sem debitar novamente quando a chave idempotente já existe', async () => {
    prisma.transacaoPix.findUnique.mockResolvedValue(pixTransaction());

    const res = await request(app)
      .post('/api/pix/send')
      .set('Authorization', BEARER)
      .set('Idempotency-Key', 'pix-key-12345')
      .send({
        chavePix: 'destino@agilbank.com',
        valor: 25.5,
        descricao: 'Teste Pix',
      })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.idempotent).toBe(true);
    expect(res.body.data.transacao.id).toBe('pix-test-id');

    expect(prisma.transacaoPix.create).not.toHaveBeenCalled();
    expect(prisma.movimentacao.create).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('nao utiliza saldoBloqueado quando saldo disponivel e insuficiente', async () => {
    prisma.user.findUnique.mockResolvedValue(
      authUser({
        saldoAtual: 50,
        saldoBloqueado: 10000,
        limitePixDiario: 1000,
        limitePixMensal: 10000,
        isVerificado: true,
      }),
    );

    const res = await request(app)
      .post('/api/pix/send')
      .set('Authorization', BEARER)
      .set('Idempotency-Key', 'pix-key-blocked-test')
      .send({
        chavePix: 'destino@agilbank.com',
        valor: 100,
        descricao: 'Teste saldo bloqueado',
      })
      .expect(400);

    expect(res.body.code).toBe('INSUFFICIENT_BALANCE');
    expect(prisma.transacaoPix.create).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
