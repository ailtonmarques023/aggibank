const request = require('supertest');
const app = require('../src/server');
const { prisma } = require('../src/config/database');

const BEARER = `Bearer ${global.testToken}`;

describe('Loans API — elegibilidade e decisao segura', () => {
  const INTERNAL_LOAN_KEY = 'internal-loan-key-test';
  const ADMIN_LOAN_KEY = 'admin-loan-key-test';

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.LOAN_DECISION_INTERNAL_KEY = INTERNAL_LOAN_KEY;
    process.env.ADMIN_API_KEY = ADMIN_LOAN_KEY;
    prisma.user.findUnique.mockResolvedValue({ ...global.testUser, scoreCredito: 750, saldoAtual: 1000 });
    prisma.emprestimo.findFirst.mockResolvedValue(null);
    prisma.emprestimo.findUnique.mockResolvedValue(null);
    prisma.emprestimo.create.mockImplementation(async ({ data }) => ({
      id: 'loan-1',
      ...data,
      dataSolicitacao: new Date('2026-05-07T15:00:00.000Z'),
      dataAprovacao: null,
      dataQuitacao: null,
    }));
    prisma.emprestimo.findMany.mockResolvedValue([]);
    prisma.emprestimo.updateMany.mockResolvedValue({ count: 1 });
    prisma.$transaction.mockImplementation(async (callback) => callback(prisma));
  });

  it('cria proposta pendente para usuario elegivel via POST /api/loans', async () => {
    const response = await request(app)
      .post('/api/loans')
      .set('Authorization', BEARER)
      .send({ valorSolicitado: 5000, prazoMeses: 12 })
      .expect(201);

    expect(response.body.success).toBe(true);
    expect(response.body.data.emprestimo.status).toBe('pendente');
    expect(prisma.emprestimo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: global.testUser.id,
          valorSolicitado: 5000,
          prazoMeses: 12,
          status: 'pendente',
        }),
      }),
    );
  });

  it('executa fluxo runtime elegivel: eligibility true, simulate 200, create 201 pendente e historico com proposta', async () => {
    prisma.emprestimo.findMany
      .mockResolvedValueOnce([
        {
          id: 'loan-runtime-1',
          valorSolicitado: 5000,
          valorAprovado: null,
          prazoMeses: 12,
          taxaJuros: 2,
          valorParcela: 472.83,
          status: 'pendente',
          dataSolicitacao: new Date('2026-05-07T15:00:00.000Z'),
          dataAprovacao: null,
          dataQuitacao: null,
        },
      ]);

    const eligibilityResponse = await request(app)
      .get('/api/loans/eligibility')
      .set('Authorization', BEARER)
      .expect(200);

    expect(eligibilityResponse.body.success).toBe(true);
    expect(eligibilityResponse.body.data.isElegivel).toBe(true);

    const simulationResponse = await request(app)
      .post('/api/loans/simulate')
      .set('Authorization', BEARER)
      .send({ valor: 5000, prazoMeses: 12 })
      .expect(200);

    expect(simulationResponse.body.success).toBe(true);
    expect(simulationResponse.body.data.valorParcela).toBeDefined();

    const createResponse = await request(app)
      .post('/api/loans')
      .set('Authorization', BEARER)
      .send({ valorSolicitado: 5000, prazoMeses: 12 })
      .expect(201);

    expect(createResponse.body.data.emprestimo.status).toBe('pendente');

    const historyResponse = await request(app)
      .get('/api/loans')
      .set('Authorization', BEARER)
      .expect(200);

    expect(historyResponse.body.success).toBe(true);
    expect(historyResponse.body.data.emprestimos).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'loan-runtime-1',
          status: 'pendente',
        }),
      ]),
    );
  });

  it('mantem bloqueio para usuario inelegivel', async () => {
    prisma.user.findUnique.mockResolvedValue({ ...global.testUser, scoreCredito: 550 });

    const response = await request(app)
      .post('/api/loans')
      .set('Authorization', BEARER)
      .send({ valorSolicitado: 3000, prazoMeses: 10 })
      .expect(403);

    expect(response.body.code).toBe('LOAN_NOT_ELIGIBLE');
    expect(prisma.emprestimo.create).not.toHaveBeenCalled();
  });

  it('executa fluxo runtime inelegivel: eligibility false e create 403 sem nova proposta no historico', async () => {
    prisma.user.findUnique.mockResolvedValue({ ...global.testUser, scoreCredito: 550 });
    prisma.emprestimo.findMany.mockResolvedValue([]);

    const eligibilityResponse = await request(app)
      .get('/api/loans/eligibility')
      .set('Authorization', BEARER)
      .expect(200);

    expect(eligibilityResponse.body.data.isElegivel).toBe(false);

    const createResponse = await request(app)
      .post('/api/loans')
      .set('Authorization', BEARER)
      .send({ valorSolicitado: 3000, prazoMeses: 10 })
      .expect(403);

    expect(createResponse.body.code).toBe('LOAN_NOT_ELIGIBLE');
    expect(prisma.emprestimo.create).not.toHaveBeenCalled();

    const historyResponse = await request(app)
      .get('/api/loans')
      .set('Authorization', BEARER)
      .expect(200);

    expect(historyResponse.body.data.emprestimos).toEqual([]);
  });

  it('mantem requireVerification ativo para conta nao verificada', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...global.testUser,
      isVerificado: false,
    });

    const response = await request(app)
      .get('/api/loans/eligibility')
      .set('Authorization', BEARER)
      .expect(403);

    expect(response.body.code).toBe('ACCOUNT_NOT_VERIFIED');
  });

  it('retorna 403 para usuario comum em approve/reject sem chave interna', async () => {
    await request(app)
      .post('/api/loans/loan-123/approve')
      .set('Authorization', BEARER)
      .send({ valorAprovado: 2000 })
      .expect(403);

    await request(app)
      .post('/api/loans/loan-123/reject')
      .set('Authorization', BEARER)
      .expect(403);

    expect(prisma.emprestimo.update).not.toHaveBeenCalled();
  });

  it('aprova proposta pendente com chave interna e credita somente dono do emprestimo', async () => {
    prisma.emprestimo.findUnique
      .mockResolvedValueOnce({
        id: 'loan-approve-1',
        userId: 'loan-owner-1',
        valorSolicitado: 1500,
        prazoMeses: 6,
        status: 'pendente',
      })
      .mockResolvedValueOnce({
        id: 'loan-approve-1',
        userId: 'loan-owner-1',
        valorSolicitado: 1500,
        valorAprovado: 1200,
        prazoMeses: 6,
        status: 'aprovado',
        dataAprovacao: new Date('2026-05-07T15:10:00.000Z'),
      });
    prisma.user.findUnique
      .mockResolvedValueOnce({ ...global.testUser, scoreCredito: 750, saldoAtual: 1000 })
      .mockResolvedValueOnce({ saldoAtual: 2300 });
    prisma.emprestimo.updateMany.mockResolvedValue({ count: 1 });
    prisma.user.update.mockResolvedValue({});
    prisma.movimentacao.create.mockResolvedValue({});

    const response = await request(app)
      .post('/api/loans/loan-approve-1/approve')
      .set('Authorization', BEARER)
      .set('x-internal-key', INTERNAL_LOAN_KEY)
      .send({ valorAprovado: 1200 })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.emprestimo.status).toBe('aprovado');
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'loan-owner-1' },
        data: { saldoAtual: { increment: 1200 } },
      }),
    );
    expect(prisma.movimentacao.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'loan-owner-1',
          valor: 1200,
          saldoAnterior: 2300,
          saldoAtual: 3500,
        }),
      }),
    );
  });

  it('bloqueia reprocessamento de emprestimo ja decidido com erro de negocio', async () => {
    prisma.emprestimo.findUnique.mockResolvedValue({
      id: 'loan-approve-1',
      userId: 'loan-owner-1',
      valorSolicitado: 1500,
      prazoMeses: 6,
      status: 'aprovado',
      valorAprovado: 1200,
      dataAprovacao: new Date('2026-05-07T15:10:00.000Z'),
    });

    const response = await request(app)
      .post('/api/loans/loan-approve-1/approve')
      .set('Authorization', BEARER)
      .set('x-internal-key', INTERNAL_LOAN_KEY)
      .send({ valorAprovado: 1200 })
      .expect(400);

    expect(response.body.code).toBe('LOAN_ALREADY_DECIDED');
    expect(prisma.emprestimo.updateMany).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.movimentacao.create).not.toHaveBeenCalled();
  });

  it('retorna 403 em rota admin sem chave interna mesmo com bearer de usuario comum', async () => {
    await request(app)
      .get('/api/admin/loans?status=pendente')
      .set('Authorization', BEARER)
      .expect(403);
  });

  it('retorna 403 em rota admin sem autenticacao de chave', async () => {
    await request(app)
      .post('/api/admin/loans/loan-123/approve')
      .send({ valorAprovado: 1000 })
      .expect(403);
  });

  it('lista emprestimos pendentes no endpoint admin', async () => {
    prisma.emprestimo.findMany.mockResolvedValue([
      {
        id: 'loan-pendente-1',
        userId: 'loan-owner-1',
        valorSolicitado: 2000,
        valorAprovado: null,
        prazoMeses: 8,
        taxaJuros: 2,
        valorParcela: 273.11,
        status: 'pendente',
        dataSolicitacao: new Date('2026-05-07T15:00:00.000Z'),
        dataAprovacao: null,
        dataQuitacao: null,
      },
    ]);

    const response = await request(app)
      .get('/api/admin/loans?status=pendente')
      .set('x-internal-key', ADMIN_LOAN_KEY)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.emprestimos).toHaveLength(1);
    expect(response.body.data.emprestimos[0].status).toBe('pendente');
  });

  it('retorna detalhe correto no endpoint admin por id', async () => {
    prisma.emprestimo.findUnique.mockResolvedValue({
      id: 'loan-detail-1',
      userId: 'loan-owner-1',
      valorSolicitado: 3100,
      valorAprovado: null,
      prazoMeses: 10,
      taxaJuros: 2,
      valorParcela: 344.52,
      status: 'pendente',
      dataSolicitacao: new Date('2026-05-07T15:00:00.000Z'),
      dataAprovacao: null,
      dataQuitacao: null,
    });

    const response = await request(app)
      .get('/api/admin/loans/loan-detail-1')
      .set('x-internal-key', ADMIN_LOAN_KEY)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.emprestimo.id).toBe('loan-detail-1');
  });

  it('aprova emprestimo no endpoint admin sem duplicar contrato de decisao', async () => {
    prisma.emprestimo.findUnique
      .mockResolvedValueOnce({
        id: 'loan-admin-approve-1',
        userId: 'loan-owner-1',
        valorSolicitado: 2200,
        prazoMeses: 10,
        status: 'pendente',
      })
      .mockResolvedValueOnce({
        id: 'loan-admin-approve-1',
        userId: 'loan-owner-1',
        valorSolicitado: 2200,
        valorAprovado: 2200,
        prazoMeses: 10,
        status: 'aprovado',
      });
    prisma.user.findUnique
      .mockResolvedValueOnce({ saldoAtual: 1000 });
    prisma.emprestimo.updateMany.mockResolvedValue({ count: 1 });
    prisma.user.update.mockResolvedValue({});
    prisma.movimentacao.create.mockResolvedValue({});

    const response = await request(app)
      .post('/api/admin/loans/loan-admin-approve-1/approve')
      .set('x-internal-key', ADMIN_LOAN_KEY)
      .send({})
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.emprestimo.status).toBe('aprovado');
    expect(prisma.movimentacao.create).toHaveBeenCalledTimes(1);
  });

  it('bloqueia reprocessamento admin e nao duplica saldo/movimentacao', async () => {
    prisma.emprestimo.findUnique.mockResolvedValue({
      id: 'loan-admin-decided',
      userId: 'loan-owner-1',
      valorSolicitado: 2200,
      valorAprovado: 2200,
      prazoMeses: 10,
      status: 'aprovado',
    });

    const response = await request(app)
      .post('/api/admin/loans/loan-admin-decided/approve')
      .set('x-internal-key', ADMIN_LOAN_KEY)
      .send({})
      .expect(400);

    expect(response.body.code).toBe('LOAN_ALREADY_DECIDED');
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.movimentacao.create).not.toHaveBeenCalled();
  });

  it('rejeita emprestimo pendente no endpoint admin', async () => {
    prisma.emprestimo.findUnique
      .mockResolvedValueOnce({
        id: 'loan-admin-reject-1',
        userId: 'loan-owner-1',
        valorSolicitado: 3300,
        status: 'pendente',
      })
      .mockResolvedValueOnce({
        id: 'loan-admin-reject-1',
        userId: 'loan-owner-1',
        valorSolicitado: 3300,
        status: 'rejeitado',
      });
    prisma.emprestimo.updateMany.mockResolvedValue({ count: 1 });

    const response = await request(app)
      .post('/api/admin/loans/loan-admin-reject-1/reject')
      .set('x-internal-key', ADMIN_LOAN_KEY)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.emprestimo.status).toBe('rejeitado');
  });

  it('retorna erro controlado ao rejeitar emprestimo ja aprovado no endpoint admin', async () => {
    prisma.emprestimo.findUnique.mockResolvedValue({
      id: 'loan-admin-reject-2',
      userId: 'loan-owner-1',
      valorSolicitado: 3300,
      valorAprovado: 3300,
      status: 'aprovado',
    });

    const response = await request(app)
      .post('/api/admin/loans/loan-admin-reject-2/reject')
      .set('x-internal-key', ADMIN_LOAN_KEY)
      .expect(400);

    expect(response.body.code).toBe('LOAN_ALREADY_DECIDED');
    expect(prisma.emprestimo.updateMany).not.toHaveBeenCalled();
  });

  it('mantem compatibilidade da fase 3 nas rotas legadas /api/loans/:id/approve', async () => {
    prisma.emprestimo.findUnique
      .mockResolvedValueOnce({
        id: 'loan-legacy-1',
        userId: 'loan-owner-legacy',
        valorSolicitado: 1000,
        prazoMeses: 6,
        status: 'pendente',
      })
      .mockResolvedValueOnce({
        id: 'loan-legacy-1',
        userId: 'loan-owner-legacy',
        valorSolicitado: 1000,
        valorAprovado: 1000,
        prazoMeses: 6,
        status: 'aprovado',
      });
    prisma.user.findUnique
      .mockResolvedValueOnce({ ...global.testUser, scoreCredito: 750, saldoAtual: 1000 })
      .mockResolvedValueOnce({ saldoAtual: 500 });
    prisma.emprestimo.updateMany.mockResolvedValue({ count: 1 });
    prisma.user.update.mockResolvedValue({});
    prisma.movimentacao.create.mockResolvedValue({});

    const response = await request(app)
      .post('/api/loans/loan-legacy-1/approve')
      .set('Authorization', BEARER)
      .set('x-internal-key', INTERNAL_LOAN_KEY)
      .send({})
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.emprestimo.status).toBe('aprovado');
  });
});
