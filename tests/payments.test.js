const request = require('supertest');
const app = require('../src/server');
const { prisma } = require('../src/config/database');

const BEARER = `Bearer ${global.testToken}`;

describe('Payments API — process com ledger', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(async (cb) => cb(prisma));
  });

  it('POST /api/payments/:id/process debita via ledger e marca processado', async () => {
    const pay = {
      id: 'pay-ledger-1',
      userId: global.testUser.id,
      valor: 50,
      tipo: 'pix',
      status: 'pendente',
    };
    prisma.user.findUnique
      .mockResolvedValueOnce({
        ...global.testUser,
        saldoAtual: 500,
        isVerificado: true,
      })
      .mockResolvedValueOnce({ saldoAtual: 500 });
    prisma.pagamento.findFirst.mockResolvedValue(pay);
    prisma.movimentacao.create.mockResolvedValue({ id: 'mov-pay-1' });
    prisma.user.update.mockResolvedValue({});
    prisma.pagamento.update.mockResolvedValue({
      ...pay,
      status: 'processado',
      dataPagamento: new Date('2026-05-10T12:00:00.000Z'),
    });

    const res = await request(app)
      .post('/api/payments/pay-ledger-1/process')
      .set('Authorization', BEARER)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe('Pagamento processado com sucesso');
    expect(res.body.data.pagamento.status).toBe('processado');
    expect(prisma.movimentacao.create).toHaveBeenCalledTimes(1);
    expect(prisma.movimentacao.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: global.testUser.id,
          tipo: 'pix',
          categoria: 'pagamento',
          referenceType: 'pagamento',
          referenceId: 'pay-ledger-1',
          idempotencyKey: 'payment-process:pay-ledger-1',
          valor: -50,
          saldoAnterior: 500,
          saldoAtual: 450,
        }),
      }),
    );
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: global.testUser.id },
      data: { saldoAtual: 450 },
    });
  });

  it('retorna 404 quando pagamento nao existe ou nao esta pendente', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...global.testUser,
      saldoAtual: 500,
      isVerificado: true,
    });
    prisma.pagamento.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/payments/inexistente/process')
      .set('Authorization', BEARER)
      .expect(404);

    expect(res.body.code).toBe('PAYMENT_NOT_FOUND');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('retorna 400 INSUFFICIENT_BALANCE quando saldo JWT insuficiente', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...global.testUser,
      saldoAtual: 30,
      isVerificado: true,
    });
    prisma.pagamento.findFirst.mockResolvedValue({
      id: 'pay-low',
      userId: global.testUser.id,
      valor: 50,
      tipo: 'pix',
      status: 'pendente',
    });

    const res = await request(app)
      .post('/api/payments/pay-low/process')
      .set('Authorization', BEARER)
      .expect(400);

    expect(res.body.code).toBe('INSUFFICIENT_BALANCE');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('nao processa novamente pagamento ja quitado', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...global.testUser,
      saldoAtual: 500,
      isVerificado: true,
    });
    prisma.pagamento.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/payments/pay-ledger-1/process')
      .set('Authorization', BEARER)
      .expect(404);

    expect(res.body.code).toBe('PAYMENT_NOT_FOUND');
  });

  it('mapeia LedgerError INSUFFICIENT_BALANCE na transacao para 400', async () => {
    const pay = {
      id: 'pay-race',
      userId: global.testUser.id,
      valor: 50,
      tipo: 'boleto',
      status: 'pendente',
    };
    prisma.user.findUnique
      .mockResolvedValueOnce({
        ...global.testUser,
        saldoAtual: 500,
        isVerificado: true,
      })
      .mockResolvedValueOnce({ saldoAtual: 20 });
    prisma.pagamento.findFirst.mockResolvedValue(pay);

    const res = await request(app)
      .post('/api/payments/pay-race/process')
      .set('Authorization', BEARER)
      .expect(400);

    expect(res.body.code).toBe('INSUFFICIENT_BALANCE');
    expect(res.body.message).toBe('Saldo insuficiente');
  });
});
