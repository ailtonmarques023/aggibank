const request = require('supertest');
const app = require('../src/server');
const { prisma } = require('../src/config/database');

const BEARER = `Bearer ${global.testToken}`;

describe('BFF painel credito /api/internal/credit/loans', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.CREDIT_PANEL_OPERATOR_EMAILS = global.testUser.email;
    prisma.user.findUnique.mockResolvedValue({ ...global.testUser, isVerificado: true });
  });

  it('retorna 401 sem token', async () => {
    const res = await request(app).get('/api/internal/credit/loans').expect(401);
    expect(res.body.code).toBe('TOKEN_REQUIRED');
  });

  it('retorna 503 quando CREDIT_PANEL_OPERATOR_EMAILS nao esta configurado', async () => {
    delete process.env.CREDIT_PANEL_OPERATOR_EMAILS;
    const res = await request(app)
      .get('/api/internal/credit/loans')
      .set('Authorization', BEARER)
      .expect(503);
    expect(res.body.code).toBe('INTERNAL_OPERATION_UNAVAILABLE');
  });

  it('retorna 403 ADMIN_ACCESS_DENIED para usuario autenticado fora da lista', async () => {
    process.env.CREDIT_PANEL_OPERATOR_EMAILS = 'outro@operador.com';
    const res = await request(app)
      .get('/api/internal/credit/loans')
      .set('Authorization', BEARER)
      .expect(403);
    expect(res.body.code).toBe('ADMIN_ACCESS_DENIED');
  });

  it('retorna 403 ACCOUNT_NOT_VERIFIED se operador nao verificado', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...global.testUser,
      isVerificado: false,
    });
    const res = await request(app)
      .get('/api/internal/credit/loans')
      .set('Authorization', BEARER)
      .expect(403);
    expect(res.body.code).toBe('ACCOUNT_NOT_VERIFIED');
  });

  it('lista propostas para operador autorizado', async () => {
    prisma.emprestimo.findMany.mockResolvedValue([
      {
        id: 'loan-1',
        userId: 'u1',
        valorSolicitado: 1000,
        valorAprovado: null,
        prazoMeses: 12,
        taxaJuros: 2,
        valorParcela: 100,
        status: 'pendente',
        dataSolicitacao: new Date(),
        dataAprovacao: null,
        dataQuitacao: null,
        user: {
          id: 'u1',
          nomeCompleto: 'Cliente Um',
          email: 'cliente@example.com',
        },
      },
    ]);

    const res = await request(app)
      .get('/api/internal/credit/loans?status=pendente')
      .set('Authorization', BEARER)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.loans).toHaveLength(1);
    expect(res.body.data.loans[0].borrower.email).toBe('cliente@example.com');
    expect(prisma.emprestimo.findMany).toHaveBeenCalled();
  });

  it('detalhe retorna 404 para id inexistente', async () => {
    prisma.emprestimo.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .get('/api/internal/credit/loans/inexistente')
      .set('Authorization', BEARER)
      .expect(404);
    expect(res.body.code).toBe('LOAN_NOT_FOUND');
  });

  it('nao exige x-internal-key no request', async () => {
    prisma.emprestimo.findMany.mockResolvedValue([]);
    await request(app)
      .get('/api/internal/credit/loans')
      .set('Authorization', BEARER)
      .expect(200);
  });
});
