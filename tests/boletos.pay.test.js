const request = require('supertest');
const app = require('../src/server');
const { prisma } = require('../src/config/database');
const { registrarDebitoSaldoAtual, LedgerError } = require('../src/services/ledgerService');

const BEARER = `Bearer ${global.testToken}`;

describe('ledgerService.registrarDebitoSaldoAtual', () => {
  it('lança LedgerError quando saldo insuficiente dentro da transação', async () => {
    const tx = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ saldoAtual: 10 }),
        update: jest.fn(),
      },
      movimentacao: { create: jest.fn() },
    };

    await expect(
      registrarDebitoSaldoAtual(tx, {
        userId: 'u1',
        valorDebito: 50,
        tipo: 'boleto',
        descricao: 'Teste',
      }),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_BALANCE', name: 'LedgerError' });

    expect(tx.user.update).not.toHaveBeenCalled();
    expect(tx.movimentacao.create).not.toHaveBeenCalled();
  });
});

describe('POST /api/boletos/:id/pay — ledger (Fase C)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(async (cb) => cb(prisma));
    prisma.user.findUnique.mockResolvedValue({
      ...global.testUser,
      saldoAtual: 1000,
      isVerificado: true,
    });
  });

  it('debita saldo e cria Movimentacao na mesma transação (saldo lido dentro do tx)', async () => {
    prisma.boleto.findFirst.mockResolvedValue({
      id: 'bol-ledger-1',
      userId: global.testUser.id,
      valor: 100,
      status: 'pendente',
      descricao: 'Cobrança teste',
      beneficiario: 'Beneficiário',
      dataVencimento: new Date(Date.now() + 86400000),
      codigoBarras: '36490'.padEnd(40, '0'),
    });
    prisma.boleto.update.mockResolvedValue({
      id: 'bol-ledger-1',
      status: 'pago',
      dataPagamento: new Date(),
    });
    prisma.user.update.mockResolvedValue({});
    prisma.movimentacao.create.mockResolvedValue({ id: 'mov-ledger-1' });

    const res = await request(app)
      .post('/api/boletos/bol-ledger-1/pay')
      .set('Authorization', BEARER)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.boleto.status).toBe('pago');

    expect(prisma.movimentacao.create).toHaveBeenCalledTimes(1);
    expect(prisma.movimentacao.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: global.testUser.id,
          tipo: 'boleto',
          valor: -100,
          saldoAnterior: 1000,
          saldoAtual: 900,
          categoria: 'pagamento',
          referenceType: 'boleto',
          referenceId: 'bol-ledger-1',
        }),
      }),
    );

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: global.testUser.id },
        data: { saldoAtual: 900 },
      }),
    );
  });

  it('retorna 400 INSUFFICIENT_BALANCE quando LedgerError no pagamento', async () => {
    prisma.boleto.findFirst.mockResolvedValue({
      id: 'bol-ledger-2',
      userId: global.testUser.id,
      valor: 9999,
      status: 'pendente',
      descricao: 'Grande',
      beneficiario: 'B',
      dataVencimento: new Date(Date.now() + 86400000),
      codigoBarras: '36491'.padEnd(40, '0'),
    });
    prisma.user.findUnique.mockResolvedValue({
      ...global.testUser,
      saldoAtual: 1000,
      isVerificado: true,
    });

    const res = await request(app)
      .post('/api/boletos/bol-ledger-2/pay')
      .set('Authorization', BEARER)
      .expect(400);

    expect(res.body.code).toBe('INSUFFICIENT_BALANCE');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
