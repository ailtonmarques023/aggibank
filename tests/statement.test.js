const request = require('supertest');
const app = require('../src/server');
const { prisma } = require('../src/config/database');
const { toStatementTipo, mapOrigem } = require('../src/services/statementService');

const BEARER = `Bearer ${global.testToken}`;

function authUser(overrides = {}) {
  return { ...global.testUser, ...overrides };
}

describe('statementService — mapeamento', () => {
  it('trata seguro de empréstimo (tipo debito, valor positivo) como DEBITO', () => {
    expect(toStatementTipo({ tipo: 'debito', valor: 39.9 })).toBe('DEBITO');
  });

  it('trata credito_bloqueado como CREDITO', () => {
    expect(toStatementTipo({ tipo: 'credito_bloqueado', valor: 500 })).toBe('CREDITO');
  });

  it('mapeia frete do cartão para FRETE', () => {
    expect(
      mapOrigem({
        tipo: 'tarifa',
        categoria: 'cartao_fisico_frete',
        referenceType: 'card_shipment',
      }),
    ).toBe('FRETE');
  });
});

describe('GET /api/user/statement', () => {
  beforeEach(() => {
    const jwt = require('jsonwebtoken');
    jwt.verify.mockImplementation(() => ({ userId: 'test-user-id' }));
    prisma.user.findUnique.mockResolvedValue(authUser());
    prisma.movimentacao.findMany.mockResolvedValue([]);
    prisma.movimentacao.count.mockResolvedValue(0);
  });

  it('retorna items vazio quando não há movimentações', async () => {
    const res = await request(app)
      .get('/api/user/statement')
      .set('Authorization', BEARER)
      .expect(200);

    expect(res.body.items).toEqual([]);
    expect(res.body.pagination).toEqual({
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 0,
    });
  });

  it('aplica paginação (page/limit) e ordenação desc por dataMovimentacao', async () => {
    await request(app)
      .get('/api/user/statement?page=2&limit=5')
      .set('Authorization', BEARER)
      .expect(200);

    expect(prisma.movimentacao.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'test-user-id' },
        orderBy: { dataMovimentacao: 'desc' },
        skip: 5,
        take: 5,
      }),
    );
    expect(prisma.movimentacao.count).toHaveBeenCalledWith({
      where: { userId: 'test-user-id' },
    });
  });

  it('isola movimentações pelo usuário do JWT (não aceita userId externo)', async () => {
    const jwt = require('jsonwebtoken');
    jwt.verify.mockImplementation(() => ({ userId: 'user-alpha' }));
    prisma.user.findUnique.mockResolvedValue(
      authUser({ id: 'user-alpha' }),
    );

    await request(app)
      .get('/api/user/statement')
      .set('Authorization', BEARER)
      .expect(200);

    expect(prisma.movimentacao.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-alpha' },
      }),
    );
    expect(prisma.movimentacao.count).toHaveBeenCalledWith({
      where: { userId: 'user-alpha' },
    });
  });

  it('retorna apenas movimentações do titular com shape do contrato e valor absoluto', async () => {
    const d1 = new Date('2026-05-10T12:00:00.000Z');
    const d2 = new Date('2026-05-09T10:00:00.000Z');
    prisma.movimentacao.findMany.mockResolvedValue([
      {
        id: 'm1',
        tipo: 'pix',
        descricao: 'PIX enviado',
        valor: -25.5,
        saldoAnterior: 100,
        saldoAtual: 74.5,
        categoria: 'transferencia',
        referenceType: 'pix',
        referenceId: 'pix-ref-1',
        dataMovimentacao: d1,
        createdAt: d1,
      },
      {
        id: 'm2',
        tipo: 'credito',
        descricao: 'Liberação',
        valor: 200,
        saldoAnterior: 50,
        saldoAtual: 250,
        categoria: 'emprestimo_desbloqueio',
        referenceType: 'emprestimo',
        referenceId: 'loan-1',
        dataMovimentacao: d2,
        createdAt: d2,
      },
    ]);
    prisma.movimentacao.count.mockResolvedValue(2);

    const res = await request(app)
      .get('/api/user/statement')
      .set('Authorization', BEARER)
      .expect(200);

    expect(res.body.items).toHaveLength(2);
    expect(res.body.items[0]).toMatchObject({
      id: 'm1',
      tipo: 'DEBITO',
      valor: 25.5,
      status: 'CONCLUIDO',
      origem: 'PIX',
      referenciaId: 'pix-ref-1',
    });
    expect(res.body.items[0].data).toBe(d1.toISOString());
    expect(res.body.items[1]).toMatchObject({
      id: 'm2',
      tipo: 'CREDITO',
      valor: 200,
      origem: 'EMPRESTIMO',
      referenciaId: 'loan-1',
    });
    expect(res.body.pagination).toEqual({
      page: 1,
      limit: 20,
      total: 2,
      totalPages: 1,
    });
  });

  it('exige autenticação', async () => {
    await request(app).get('/api/user/statement').expect(401);
  });
});
