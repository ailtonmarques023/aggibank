const request = require('supertest');
const app = require('../src/server');
const { prisma } = require('../src/config/database');
const emailUtils = require('../src/utils/email');
const { sendLoanApprovedBlockedEmailIfNeeded } = require('../src/services/loanApprovedBlockedEmailService');

const BEARER = `Bearer ${global.testToken}`;

function flushDeferred() {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('Loans API — elegibilidade e decisao segura', () => {
  const INTERNAL_LOAN_KEY = 'internal-loan-key-test';
  const ADMIN_LOAN_KEY = 'admin-loan-key-test';

  let __testLastLoanCreate;
  let __notifByDedupeKey;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.LOAN_DECISION_INTERNAL_KEY = INTERNAL_LOAN_KEY;
    process.env.ADMIN_API_KEY = ADMIN_LOAN_KEY;
    __testLastLoanCreate = null;
    __notifByDedupeKey = Object.create(null);
    prisma.user.findUnique.mockResolvedValue({
      ...global.testUser,
      scoreCredito: 750,
      saldoAtual: 1000,
      saldoBloqueado: 0,
      isVerificado: true,
      dadosProfissionais: { rendaMensal: 3000 },
    });
    prisma.emprestimo.findFirst.mockResolvedValue(null);
    prisma.emprestimo.create.mockImplementation(async ({ data }) => {
      __testLastLoanCreate = {
        id: 'loan-1',
        ...data,
        dataSolicitacao: new Date('2026-05-07T15:00:00.000Z'),
        dataAprovacao: null,
        dataQuitacao: null,
      };
      return __testLastLoanCreate;
    });
    prisma.emprestimo.findUnique.mockImplementation(async (args) => {
      if (!args || !args.where || !args.where.id) return null;
      if (!args.select) return null;
      if (!__testLastLoanCreate || args.where.id !== __testLastLoanCreate.id) return null;
      const data = __testLastLoanCreate;
      const vs = Number(data.valorSolicitado);
      return {
        id: data.id,
        userId: data.userId,
        valorSolicitado: data.valorSolicitado,
        valorAprovado: vs,
        prazoMeses: data.prazoMeses,
        taxaJuros: data.taxaJuros,
        valorParcela: data.valorParcela,
        status: 'aprovado',
        insuranceSelected: data.insuranceSelected,
        insuranceAmount: data.insuranceAmount,
        insuranceTermsAccepted: data.insuranceTermsAccepted,
        fundsStatus: 'bloqueado',
        blockedAmount: vs,
        guaranteeStatus: data.insuranceSelected ? 'not_required' : 'pending',
        insuranceChargeStatus: data.insuranceSelected ? 'pendente' : null,
        dataSolicitacao: data.dataSolicitacao,
        dataAprovacao: new Date('2026-05-07T15:10:00.000Z'),
        dataQuitacao: null,
      };
    });
    prisma.emprestimo.findMany.mockResolvedValue([]);
    prisma.emprestimo.updateMany.mockResolvedValue({ count: 1 });
    prisma.emprestimo.update.mockResolvedValue({});
    prisma.loanInsuranceCharge.findUnique.mockResolvedValue(null);
    prisma.loanInsuranceCharge.create.mockResolvedValue({
      id: 'charge-1',
      loanId: 'loan-1',
      amount: 39.9,
      status: 'pendente',
    });
    prisma.loanInsuranceCharge.updateMany.mockResolvedValue({ count: 1 });
    prisma.$transaction.mockImplementation(async (callback) => callback(prisma));
    prisma.notificacao.findUnique.mockImplementation(async ({ where }) => {
      if (!where || !where.dedupeKey) return null;
      return __notifByDedupeKey[where.dedupeKey] || null;
    });
    prisma.notificacao.create.mockImplementation(async ({ data }) => {
      const row = {
        id: 'notif-loan-test',
        ...data,
        dataEnvio: new Date('2026-05-09T12:00:00.000Z'),
        createdAt: new Date('2026-05-09T12:00:00.000Z'),
        isLida: false,
        readAt: null,
      };
      if (data.dedupeKey) {
        __notifByDedupeKey[data.dedupeKey] = {
          id: row.id,
          userId: row.userId,
          metadata:
            row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
              ? { ...row.metadata }
              : {},
        };
      }
      return row;
    });
    prisma.notificacao.update.mockImplementation(async ({ where, data }) => {
      const entry = Object.values(__notifByDedupeKey).find((v) => v.id === where.id);
      if (entry && data.metadata) {
        entry.metadata = { ...entry.metadata, ...data.metadata };
      }
      return { id: where.id, ...data };
    });
  });

  it('aprova automaticamente e bloqueia saldo para usuario elegivel via POST /api/loans', async () => {
    const response = await request(app)
      .post('/api/loans')
      .set('Authorization', BEARER)
      .send({ valorSolicitado: 5000, prazoMeses: 12 })
      .expect(201);

    expect(response.body.success).toBe(true);
    expect(response.body.data.emprestimo.status).toBe('aprovado');
    expect(response.body.data.emprestimo.fundsStatus).toBe('bloqueado');
    expect(response.body.data.emprestimo.blockedAmount).toBe(5000);
    expect(response.body.data.emprestimo.guaranteeStatus).toBe('pending');
    expect(prisma.emprestimo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: global.testUser.id,
          valorSolicitado: 5000,
          prazoMeses: 12,
          status: 'pendente',
          insuranceSelected: false,
          insuranceTermsAccepted: false,
          guaranteeStatus: 'pending',
        }),
      }),
    );
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: global.testUser.id },
        data: { saldoBloqueado: { increment: 5000 } },
      }),
    );
    prisma.user.update.mock.calls.forEach((call) => {
      expect(call[0].data.saldoAtual).toBeUndefined();
    });
    expect(prisma.movimentacao.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tipo: 'credito_bloqueado',
          valor: 5000,
          saldoAnterior: 1000,
          saldoAtual: 1000,
        }),
      }),
    );
    expect(prisma.notificacao.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: global.testUser.id,
          tipo: 'loan_approved_blocked',
          titulo: 'Empréstimo aprovado',
          dedupeKey: 'loan_approved_blocked:loan-1',
          metadata: { loanId: 'loan-1', action: 'submit_guarantee' },
        }),
      }),
    );
    await flushDeferred();
    expect(emailUtils.sendLoanApprovedBlockedEmail).toHaveBeenCalledTimes(1);
    expect(emailUtils.sendLoanApprovedBlockedEmail).toHaveBeenCalledWith(
      { email: global.testUser.email, nomeCompleto: global.testUser.nomeCompleto },
      expect.objectContaining({
        valor: 5000,
        acaoDesbloqueio: expect.stringMatching(/garantia|desbloqueio/i),
      }),
    );
  });

  it('rejeita proposta com seguro sem aceite dos termos', async () => {
    const response = await request(app)
      .post('/api/loans')
      .set('Authorization', BEARER)
      .send({
        valorSolicitado: 5000,
        prazoMeses: 12,
        insuranceSelected: true,
        insuranceTermsAccepted: false,
      })
      .expect(400);

    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(prisma.emprestimo.create).not.toHaveBeenCalled();
  });

  it('registra proposta com seguro e termos aceitos', async () => {
    const response = await request(app)
      .post('/api/loans')
      .set('Authorization', BEARER)
      .send({
        valorSolicitado: 5000,
        prazoMeses: 12,
        insuranceSelected: true,
        insuranceTermsAccepted: true,
      })
      .expect(201);

    expect(response.body.success).toBe(true);
    expect(response.body.data.emprestimo.status).toBe('aprovado');
    expect(response.body.data.emprestimo.fundsStatus).toBe('bloqueado');
    expect(response.body.data.emprestimo.insuranceChargeStatus).toBe('pendente');
    expect(prisma.emprestimo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          insuranceSelected: true,
          insuranceTermsAccepted: true,
          insuranceAmount: 39.9,
          guaranteeStatus: 'not_required',
        }),
      }),
    );
    expect(prisma.loanInsuranceCharge.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          loanId: 'loan-1',
          userId: global.testUser.id,
          amount: 39.9,
          status: 'pendente',
        }),
      }),
    );
    expect(prisma.notificacao.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: { loanId: 'loan-1', action: 'pay_insurance' },
        }),
      }),
    );
    await flushDeferred();
    expect(emailUtils.sendLoanApprovedBlockedEmail).toHaveBeenCalledTimes(1);
    expect(emailUtils.sendLoanApprovedBlockedEmail).toHaveBeenCalledWith(
      { email: global.testUser.email, nomeCompleto: global.testUser.nomeCompleto },
      expect.objectContaining({
        valor: 5000,
        acaoDesbloqueio: expect.stringContaining('39,90'),
      }),
    );
  });

  it('não envia e-mail quando validação impede criação do empréstimo', async () => {
    await request(app)
      .post('/api/loans')
      .set('Authorization', BEARER)
      .send({
        valorSolicitado: 5000,
        prazoMeses: 12,
        insuranceSelected: true,
        insuranceTermsAccepted: false,
      })
      .expect(400);

    await flushDeferred();
    expect(emailUtils.sendLoanApprovedBlockedEmail).not.toHaveBeenCalled();
  });

  it('falha no envio de e-mail não impede 201 no empréstimo autoaprovado', async () => {
    emailUtils.sendLoanApprovedBlockedEmail.mockRejectedValueOnce(new Error('provider_down'));
    const response = await request(app)
      .post('/api/loans')
      .set('Authorization', BEARER)
      .send({ valorSolicitado: 5000, prazoMeses: 12 })
      .expect(201);

    expect(response.body.success).toBe(true);
    await flushDeferred();
    expect(emailUtils.sendLoanApprovedBlockedEmail).toHaveBeenCalled();
  });

  it('não reenvia e-mail para o mesmo loanId após primeiro envio (idempotência)', async () => {
    await request(app)
      .post('/api/loans')
      .set('Authorization', BEARER)
      .send({ valorSolicitado: 5000, prazoMeses: 12 })
      .expect(201);
    await flushDeferred();
    expect(emailUtils.sendLoanApprovedBlockedEmail).toHaveBeenCalledTimes(1);
    emailUtils.sendLoanApprovedBlockedEmail.mockClear();
    await sendLoanApprovedBlockedEmailIfNeeded({
      loanId: 'loan-1',
      userId: global.testUser.id,
      insuranceSelected: false,
      valorAprovado: 5000,
    });
    expect(emailUtils.sendLoanApprovedBlockedEmail).not.toHaveBeenCalled();
  });

  it('executa fluxo runtime elegivel: eligibility true, simulate 200, create 201 auto-aprovado e historico com proposta', async () => {
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

    expect(createResponse.body.data.emprestimo.status).toBe('aprovado');
    expect(createResponse.body.data.emprestimo.fundsStatus).toBe('bloqueado');

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

  it('retorna 400 quando ja existe credito aprovado bloqueado', async () => {
    prisma.emprestimo.findFirst.mockImplementation(async ({ where }) => {
      if (where.status === 'pendente') return null;
      if (where.status === 'aprovado' && where.fundsStatus === 'bloqueado') {
        return {
          id: 'blocked-existing',
          userId: global.testUser.id,
          status: 'aprovado',
          fundsStatus: 'bloqueado',
        };
      }
      return null;
    });

    const response = await request(app)
      .post('/api/loans')
      .set('Authorization', BEARER)
      .send({ valorSolicitado: 3000, prazoMeses: 12 })
      .expect(400);

    expect(response.body.code).toBe('LOAN_BLOCKED_FUNDS_ACTIVE');
    expect(prisma.emprestimo.create).not.toHaveBeenCalled();
  });

  it('mantem bloqueio para usuario inelegivel', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...global.testUser,
      scoreCredito: 750,
      isVerificado: true,
      dadosProfissionais: { rendaMensal: 1000 },
    });

    const response = await request(app)
      .post('/api/loans')
      .set('Authorization', BEARER)
      .send({ valorSolicitado: 3000, prazoMeses: 10 })
      .expect(403);

    expect(response.body.code).toBe('LOAN_NOT_ELIGIBLE');
    expect(prisma.emprestimo.create).not.toHaveBeenCalled();
  });

  it('executa fluxo runtime inelegivel: eligibility false e create 403 sem nova proposta no historico', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...global.testUser,
      scoreCredito: 750,
      isVerificado: true,
      dadosProfissionais: { rendaMensal: 1000 },
    });
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
      dadosProfissionais: { rendaMensal: 3000 },
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
        insuranceSelected: false,
        insuranceTermsAccepted: false,
      })
      .mockResolvedValueOnce({
        id: 'loan-approve-1',
        userId: 'loan-owner-1',
        valorSolicitado: 1500,
        valorAprovado: 1200,
        prazoMeses: 6,
        status: 'aprovado',
        fundsStatus: 'bloqueado',
        blockedAmount: 1200,
        guaranteeStatus: 'pending',
        insuranceChargeStatus: null,
        dataAprovacao: new Date('2026-05-07T15:10:00.000Z'),
      });
    prisma.user.findUnique
      .mockResolvedValueOnce({
        ...global.testUser,
        saldoAtual: 1000,
        saldoBloqueado: 0,
        isVerificado: true,
      })
      .mockResolvedValueOnce({
        saldoAtual: 1000,
        saldoBloqueado: 0,
      });
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
        data: { saldoBloqueado: { increment: 1200 } },
      }),
    );
    expect(prisma.movimentacao.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'loan-owner-1',
          tipo: 'credito_bloqueado',
          valor: 1200,
          saldoAnterior: 1000,
          saldoAtual: 1000,
        }),
      }),
    );
    expect(prisma.loanInsuranceCharge.create).not.toHaveBeenCalled();
  });

  it('ao aprovar com seguro cria cobranca e mantem credito bloqueado ate pagamento', async () => {
    prisma.emprestimo.findUnique
      .mockResolvedValueOnce({
        id: 'loan-ins-1',
        userId: 'loan-owner-1',
        valorSolicitado: 2000,
        prazoMeses: 12,
        status: 'pendente',
        insuranceSelected: true,
        insuranceTermsAccepted: true,
      })
      .mockResolvedValueOnce({
        id: 'loan-ins-1',
        userId: 'loan-owner-1',
        status: 'aprovado',
        valorAprovado: 2000,
        fundsStatus: 'bloqueado',
        insuranceChargeStatus: 'pendente',
        guaranteeStatus: 'not_required',
      });
    prisma.user.findUnique
      .mockResolvedValueOnce({
        ...global.testUser,
        saldoAtual: 500,
        saldoBloqueado: 0,
        isVerificado: true,
      })
      .mockResolvedValueOnce({
        saldoAtual: 500,
        saldoBloqueado: 0,
      });
    prisma.emprestimo.updateMany.mockResolvedValue({ count: 1 });
    prisma.user.update.mockResolvedValue({});
    prisma.movimentacao.create.mockResolvedValue({});

    const response = await request(app)
      .post('/api/loans/loan-ins-1/approve')
      .set('Authorization', BEARER)
      .set('x-internal-key', INTERNAL_LOAN_KEY)
      .send({ valorAprovado: 2000 })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(prisma.loanInsuranceCharge.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          loanId: 'loan-ins-1',
          userId: 'loan-owner-1',
          amount: 39.9,
          status: 'pendente',
        }),
      }),
    );
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { saldoBloqueado: { increment: 2000 } },
      }),
    );
  });

  it('bloqueia aprovacao quando seguro marcado sem termos aceitos', async () => {
    prisma.emprestimo.findUnique.mockResolvedValueOnce({
      id: 'loan-bad-ins',
      userId: 'loan-owner-1',
      valorSolicitado: 1000,
      prazoMeses: 6,
      status: 'pendente',
      insuranceSelected: true,
      insuranceTermsAccepted: false,
    });

    const response = await request(app)
      .post('/api/loans/loan-bad-ins/approve')
      .set('Authorization', BEARER)
      .set('x-internal-key', INTERNAL_LOAN_KEY)
      .send({ valorAprovado: 1000 })
      .expect(400);

    expect(response.body.code).toBe('LOAN_INSURANCE_TERMS_REQUIRED');
    expect(prisma.emprestimo.updateMany).not.toHaveBeenCalled();
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
        insuranceSelected: false,
        insuranceTermsAccepted: false,
      })
      .mockResolvedValueOnce({
        id: 'loan-admin-approve-1',
        userId: 'loan-owner-1',
        valorSolicitado: 2200,
        valorAprovado: 2200,
        prazoMeses: 10,
        status: 'aprovado',
        fundsStatus: 'bloqueado',
      });
    prisma.user.findUnique.mockResolvedValueOnce({ saldoAtual: 1000, saldoBloqueado: 0 });
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
        insuranceSelected: false,
        insuranceTermsAccepted: false,
      })
      .mockResolvedValueOnce({
        id: 'loan-legacy-1',
        userId: 'loan-owner-legacy',
        valorSolicitado: 1000,
        valorAprovado: 1000,
        prazoMeses: 6,
        status: 'aprovado',
        fundsStatus: 'bloqueado',
      });
    prisma.user.findUnique
      .mockResolvedValueOnce({
        ...global.testUser,
        saldoAtual: 1000,
        saldoBloqueado: 0,
        isVerificado: true,
      })
      .mockResolvedValueOnce({
        saldoAtual: 1000,
        saldoBloqueado: 0,
      });
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

  it('quita seguro do empréstimo e libera saldo disponível', async () => {
    prisma.emprestimo.findUnique
      .mockResolvedValueOnce({
        id: 'loan-pay-1',
        userId: global.testUser.id,
        status: 'aprovado',
        valorAprovado: 1500,
        insuranceSelected: true,
        insuranceChargeStatus: 'pendente',
        fundsStatus: 'bloqueado',
        guaranteeStatus: 'not_required',
      })
      .mockResolvedValueOnce({
        id: 'loan-pay-1',
        userId: global.testUser.id,
        status: 'aprovado',
        fundsStatus: 'disponivel',
        insuranceChargeStatus: 'pago',
      });
    prisma.loanInsuranceCharge.findUnique.mockResolvedValueOnce({
      id: 'chg-1',
      loanId: 'loan-pay-1',
      userId: global.testUser.id,
      amount: 39.9,
      status: 'pendente',
    });
    prisma.user.findUnique
      .mockResolvedValueOnce({
        ...global.testUser,
        saldoAtual: 200,
        saldoBloqueado: 1500,
        isVerificado: true,
      })
      .mockResolvedValueOnce({
        saldoAtual: 200,
        saldoBloqueado: 1500,
      });
    prisma.user.update.mockResolvedValue({});
    prisma.emprestimo.update.mockResolvedValue({});
    prisma.movimentacao.create.mockResolvedValue({});

    const response = await request(app)
      .post('/api/loans/loan-pay-1/insurance/pay')
      .set('Authorization', BEARER)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: global.testUser.id },
        data: expect.objectContaining({
          saldoAtual: { increment: 1500 - 39.9 },
          saldoBloqueado: { decrement: 1500 },
        }),
      }),
    );
    expect(prisma.movimentacao.create).toHaveBeenCalledTimes(2);
  });

  it('aprova garantia internamente e move saldoBloqueado para saldoAtual', async () => {
    prisma.emprestimo.findUnique
      .mockReset()
      .mockResolvedValueOnce({
        id: 'loan-guarantee-1',
        userId: global.testUser.id,
        status: 'aprovado',
        valorAprovado: 800,
        insuranceSelected: false,
        fundsStatus: 'bloqueado',
        guaranteeStatus: 'pending',
      })
      .mockResolvedValueOnce({
        id: 'loan-guarantee-1',
        userId: global.testUser.id,
        status: 'aprovado',
        valorAprovado: 800,
        fundsStatus: 'disponivel',
        guaranteeStatus: 'approved',
      });
    prisma.user.findUnique
      .mockResolvedValueOnce({
        ...global.testUser,
        saldoAtual: 200,
        saldoBloqueado: 800,
        isVerificado: true,
      })
      .mockResolvedValueOnce({
        saldoAtual: 200,
        saldoBloqueado: 800,
      });
    prisma.emprestimo.updateMany.mockResolvedValue({ count: 1 });
    prisma.user.update.mockResolvedValue({});
    prisma.movimentacao.create.mockResolvedValue({});

    const response = await request(app)
      .post('/api/loans/loan-guarantee-1/guarantee/approve')
      .set('Authorization', BEARER)
      .set('x-internal-key', INTERNAL_LOAN_KEY)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: global.testUser.id },
        data: expect.objectContaining({
          saldoAtual: { increment: 800 },
          saldoBloqueado: { decrement: 800 },
        }),
      }),
    );
  });

  it('nao duplica quitacao de seguro', async () => {
    prisma.emprestimo.findUnique.mockResolvedValue({
      id: 'loan-pay-2',
      userId: global.testUser.id,
      status: 'aprovado',
      valorAprovado: 1000,
      insuranceSelected: true,
      insuranceChargeStatus: 'pago',
      fundsStatus: 'disponivel',
    });

    const response = await request(app)
      .post('/api/loans/loan-pay-2/insurance/pay')
      .set('Authorization', BEARER)
      .expect(400);

    expect(response.body.code).toBe('LOAN_INSURANCE_ALREADY_SETTLED');
  });

  it('retorna inelegivel para renda mensal igual a 1000', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...global.testUser,
      scoreCredito: 750,
      isVerificado: true,
      dadosProfissionais: { rendaMensal: 1000 },
    });

    const response = await request(app)
      .get('/api/loans/eligibility')
      .set('Authorization', BEARER)
      .expect(200);

    expect(response.body.data).toEqual(
      expect.objectContaining({
        isElegivel: false,
        rendaMensal: 1000,
        limiteMaximo: 0,
        prazoMaximo: 0,
      }),
    );
  });

  it('retorna elegivel para renda mensal 1000.01', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...global.testUser,
      scoreCredito: 750,
      isVerificado: true,
      dadosProfissionais: { rendaMensal: 1000.01 },
    });

    const response = await request(app)
      .get('/api/loans/eligibility')
      .set('Authorization', BEARER)
      .expect(200);

    expect(response.body.data).toEqual(
      expect.objectContaining({
        isElegivel: true,
        rendaMensal: 1000.01,
        limiteMaximo: 4000.04,
        prazoMaximo: 72,
      }),
    );
  });

  it('calcula limite de 4800 para renda 1200', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...global.testUser,
      scoreCredito: 750,
      isVerificado: true,
      dadosProfissionais: { rendaMensal: 1200 },
    });

    const response = await request(app)
      .get('/api/loans/eligibility')
      .set('Authorization', BEARER)
      .expect(200);

    expect(response.body.data).toEqual(
      expect.objectContaining({
        isElegivel: true,
        rendaMensal: 1200,
        limiteMaximo: 4800,
        prazoMaximo: 72,
      }),
    );
  });

  it('calcula limite de 12000 para renda 3000', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...global.testUser,
      scoreCredito: 750,
      isVerificado: true,
      dadosProfissionais: { rendaMensal: 3000 },
    });

    const response = await request(app)
      .get('/api/loans/eligibility')
      .set('Authorization', BEARER)
      .expect(200);

    expect(response.body.data).toEqual(
      expect.objectContaining({
        isElegivel: true,
        rendaMensal: 3000,
        limiteMaximo: 12000,
        prazoMaximo: 72,
      }),
    );
  });

  it('bloqueia simulacao acima do limite de renda x4', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...global.testUser,
      scoreCredito: 750,
      isVerificado: true,
      dadosProfissionais: { rendaMensal: 1200 },
    });

    const response = await request(app)
      .post('/api/loans/simulate')
      .set('Authorization', BEARER)
      .send({ valor: 5000, prazoMeses: 12 })
      .expect(400);

    expect(response.body.code).toBe('LOAN_AMOUNT_ABOVE_LIMIT');
  });

  it('bloqueia simulacao com prazo acima de 72 meses', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...global.testUser,
      scoreCredito: 750,
      isVerificado: true,
      dadosProfissionais: { rendaMensal: 3000 },
    });

    const response = await request(app)
      .post('/api/loans/simulate')
      .set('Authorization', BEARER)
      .send({ valor: 2000, prazoMeses: 73 })
      .expect(400);

    expect(response.body.code).toBe('LOAN_TERM_ABOVE_LIMIT');
  });

  it('bloqueia criacao de proposta com valor acima do limite', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...global.testUser,
      scoreCredito: 750,
      isVerificado: true,
      dadosProfissionais: { rendaMensal: 1200 },
    });

    const response = await request(app)
      .post('/api/loans')
      .set('Authorization', BEARER)
      .send({ valorSolicitado: 5000, prazoMeses: 12 })
      .expect(400);

    expect(response.body.code).toBe('LOAN_AMOUNT_ABOVE_LIMIT');
    expect(prisma.emprestimo.create).not.toHaveBeenCalled();
  });

  it('bloqueia criacao de proposta com prazo acima de 72', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...global.testUser,
      scoreCredito: 750,
      isVerificado: true,
      dadosProfissionais: { rendaMensal: 3000 },
    });

    const response = await request(app)
      .post('/api/loans')
      .set('Authorization', BEARER)
      .send({ valorSolicitado: 5000, prazoMeses: 73 })
      .expect(400);

    expect(response.body.code).toBe('LOAN_TERM_ABOVE_LIMIT');
    expect(prisma.emprestimo.create).not.toHaveBeenCalled();
  });

  it('GET /api/user/user-complete-data retorna saldoBloqueado para o dashboard', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: global.testUser.id,
      nomeCompleto: global.testUser.nomeCompleto,
      email: global.testUser.email,
      cpf: global.testUser.cpf,
      telefone: global.testUser.telefone,
      dataNascimento: global.testUser.dataNascimento,
      saldoAtual: 100,
      saldoBloqueado: 5000,
      limiteCartao: null,
      limitePixDiario: 1000,
      limitePixMensal: 10000,
      scoreCredito: 750,
      numeroConta: '123456',
      digitoConta: '7',
      agencia: '0001',
      isAtivo: true,
      isVerificado: true,
      endereco: null,
      dadosProfissionais: null,
      configuracoes: null,
    });

    const response = await request(app)
      .get('/api/user/user-complete-data')
      .set('Authorization', BEARER)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.user.saldoAtual).toBe(100);
    expect(response.body.data.user.saldoBloqueado).toBe(5000);
  });
});
