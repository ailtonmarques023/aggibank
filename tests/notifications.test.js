const request = require('supertest');
const app = require('../src/server');
const { prisma } = require('../src/config/database');
const {
  notifyLoanApprovedBlockedFunds,
  notifyCardApproved,
  notifyBoletoPago,
  notifyLoanGuaranteeCreditReleased,
} = require('../src/services/inAppNotificationService');

const BEARER = `Bearer ${global.testToken}`;

describe('Notifications API e serviço in-app', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue({
      ...global.testUser,
      isVerificado: true,
    });
    prisma.notificacao.findMany.mockResolvedValue([]);
    prisma.notificacao.count.mockResolvedValue(0);
    prisma.notificacao.findFirst.mockResolvedValue(null);
    prisma.notificacao.findUnique.mockResolvedValue(null);
    prisma.notificacao.create.mockImplementation(async ({ data }) => ({
      id: 'notif-new',
      ...data,
      isLida: false,
      readAt: null,
      dataEnvio: new Date('2026-05-09T12:00:00.000Z'),
      createdAt: new Date('2026-05-09T12:00:00.000Z'),
    }));
    prisma.notificacao.update.mockImplementation(async ({ data }) => ({
      id: 'notif-1',
      isLida: data.isLida,
      readAt: data.readAt,
      titulo: 't',
      mensagem: 'm',
      tipo: 'loan_approved_blocked',
      dataEnvio: new Date(),
    }));
    prisma.notificacao.updateMany.mockResolvedValue({ count: 2 });
  });

  it('GET /api/notifications exige autenticação', async () => {
    await request(app).get('/api/notifications').expect(401);
  });

  it('GET /api/notifications não retorna notificações de outro usuário', async () => {
    prisma.notificacao.findMany.mockResolvedValue([]);
    prisma.notificacao.count.mockResolvedValue(0);
    const res = await request(app).get('/api/notifications').set('Authorization', BEARER).expect(200);
    expect(prisma.notificacao.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'test-user-id' }),
      }),
    );
    expect(res.body.data.notifications).toEqual([]);
  });

  it('lista apenas notificações do usuário autenticado', async () => {
    prisma.notificacao.findMany.mockResolvedValue([
      {
        id: 'n1',
        titulo: 'Empréstimo aprovado',
        mensagem: 'Valor bloqueado.',
        tipo: 'loan_approved_blocked',
        isLida: false,
        dataEnvio: new Date('2026-05-09T12:00:00.000Z'),
        createdAt: new Date('2026-05-09T12:00:00.000Z'),
        readAt: null,
        metadata: { loanId: 'L1', action: 'pay_insurance' },
      },
    ]);
    prisma.notificacao.count.mockResolvedValueOnce(1).mockResolvedValueOnce(1);

    const res = await request(app).get('/api/notifications').set('Authorization', BEARER).expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.notifications).toHaveLength(1);
    expect(res.body.data.notifications[0].title).toBe('Empréstimo aprovado');
    expect(res.body.data.notifications[0].status).toBe('unread');
    expect(res.body.data.notifications[0].metadata.action).toBe('pay_insurance');
    expect(prisma.notificacao.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'test-user-id' }),
      }),
    );
  });

  it('GET /api/notifications?countOnly=true&status=unread retorna contagem', async () => {
    prisma.notificacao.count.mockResolvedValue(3);
    const res = await request(app)
      .get('/api/notifications?countOnly=true&status=unread')
      .set('Authorization', BEARER)
      .expect(200);

    expect(res.body.data.count).toBe(3);
    expect(prisma.notificacao.findMany).not.toHaveBeenCalled();
  });

  it('POST /api/notifications/:id/read marca lida e define readAt', async () => {
    prisma.notificacao.findFirst.mockResolvedValue({
      id: 'n1',
      userId: 'test-user-id',
      isLida: false,
    });

    const res = await request(app)
      .post('/api/notifications/n1/read')
      .set('Authorization', BEARER)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.notification.status).toBe('read');
    expect(prisma.notificacao.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'n1' },
        data: expect.objectContaining({ isLida: true, readAt: expect.any(Date) }),
      }),
    );
  });

  it('não marca notificação de outro usuário', async () => {
    prisma.notificacao.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/notifications/outro/read')
      .set('Authorization', BEARER)
      .expect(404);

    expect(res.body.code).toBe('NOTIFICATION_NOT_FOUND');
    expect(prisma.notificacao.update).not.toHaveBeenCalled();
  });

  it('POST /api/notifications/read-all atualiza não lidas', async () => {
    const res = await request(app).post('/api/notifications/read-all').set('Authorization', BEARER).expect(200);

    expect(res.body.success).toBe(true);
    expect(prisma.notificacao.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'test-user-id', isLida: false },
        data: expect.objectContaining({ isLida: true }),
      }),
    );
  });

  it('notifyLoanApprovedBlockedFunds com seguro grava mensagem e action pay_insurance', async () => {
    prisma.notificacao.findUnique.mockResolvedValue(null);
    await notifyLoanApprovedBlockedFunds({
      userId: 'test-user-id',
      loanId: 'loan-xyz',
      insuranceSelected: true,
    });
    expect(prisma.notificacao.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tipo: 'loan_approved_blocked',
          dedupeKey: 'loan_approved_blocked:loan-xyz',
          metadata: { loanId: 'loan-xyz', action: 'pay_insurance' },
        }),
      }),
    );
    expect(String(prisma.notificacao.create.mock.calls[0][0].data.mensagem)).toContain('Quite o seguro');
  });

  it('notifyLoanApprovedBlockedFunds sem seguro orienta garantia', async () => {
    prisma.notificacao.findUnique.mockResolvedValue(null);
    await notifyLoanApprovedBlockedFunds({
      userId: 'test-user-id',
      loanId: 'loan-abc',
      insuranceSelected: false,
    });
    expect(prisma.notificacao.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: { loanId: 'loan-abc', action: 'submit_guarantee' },
        }),
      }),
    );
    expect(String(prisma.notificacao.create.mock.calls[0][0].data.mensagem)).toContain('garantia');
  });

  it('notifyLoanApprovedBlockedFunds não duplica para o mesmo loanId', async () => {
    prisma.notificacao.findUnique.mockResolvedValue({ id: 'already' });
    await notifyLoanApprovedBlockedFunds({
      userId: 'test-user-id',
      loanId: 'loan-dup',
      insuranceSelected: true,
    });
    await notifyLoanApprovedBlockedFunds({
      userId: 'test-user-id',
      loanId: 'loan-dup',
      insuranceSelected: true,
    });
    expect(prisma.notificacao.create).not.toHaveBeenCalled();
  });

  it('notifyCardApproved cria tipo card_approved e dedupeKey card_approved:<cardId>', async () => {
    prisma.notificacao.findUnique.mockResolvedValue(null);
    await notifyCardApproved({
      userId: 'test-user-id',
      cardId: 'card-uuid-1',
      limiteAprovado: 2500,
    });
    expect(prisma.notificacao.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tipo: 'card_approved',
          dedupeKey: 'card_approved:card-uuid-1',
          titulo: 'Cartão aprovado',
          metadata: { cardId: 'card-uuid-1', action: 'view_card' },
        }),
      }),
    );
    const msg = String(prisma.notificacao.create.mock.calls[0][0].data.mensagem);
    expect(msg).toContain('2.500,00');
    expect(msg).toContain('Meus cartões');
  });

  it('notifyCardApproved não duplica para o mesmo cardId', async () => {
    prisma.notificacao.findUnique.mockResolvedValue({ id: 'exists' });
    await notifyCardApproved({
      userId: 'test-user-id',
      cardId: 'card-dup',
      limiteAprovado: 100,
    });
    expect(prisma.notificacao.create).not.toHaveBeenCalled();
  });

  it('notifyBoletoPago persiste tipo boleto_pago e metadata view_statement', async () => {
    prisma.notificacao.findUnique.mockResolvedValue(null);
    await notifyBoletoPago({
      userId: 'test-user-id',
      boletoId: 'bol-x',
      movimentacaoId: 'mov-x',
      valor: 42.5,
    });
    expect(prisma.notificacao.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tipo: 'boleto_pago',
          dedupeKey: 'boleto_pago:bol-x',
          titulo: 'Boleto pago com sucesso',
          metadata: {
            boletoId: 'bol-x',
            movimentacaoId: 'mov-x',
            valor: 42.5,
            action: 'view_statement',
          },
        }),
      }),
    );
  });

  it('notifyBoletoPago não duplica para o mesmo boletoId', async () => {
    prisma.notificacao.findUnique.mockResolvedValue({ id: 'already-bol' });
    await notifyBoletoPago({
      userId: 'test-user-id',
      boletoId: 'bol-dup',
      movimentacaoId: 'mov-1',
      valor: 10,
    });
    await notifyBoletoPago({
      userId: 'test-user-id',
      boletoId: 'bol-dup',
      movimentacaoId: 'mov-2',
      valor: 10,
    });
    expect(prisma.notificacao.create).not.toHaveBeenCalled();
  });

  it('notifyLoanGuaranteeCreditReleased persiste tipo e action view_statement', async () => {
    prisma.notificacao.findUnique.mockResolvedValue(null);
    await notifyLoanGuaranteeCreditReleased({
      userId: 'test-user-id',
      loanId: 'loan-g',
      movimentacaoId: 'mov-g',
      valor: 800,
    });
    expect(prisma.notificacao.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tipo: 'loan_guarantee_credit_released',
          dedupeKey: 'loan_guarantee_credit_released:loan-g',
          titulo: 'Crédito liberado',
          metadata: {
            loanId: 'loan-g',
            movimentacaoId: 'mov-g',
            valor: 800,
            action: 'view_statement',
          },
        }),
      }),
    );
  });

  it('notifyLoanGuaranteeCreditReleased não duplica para o mesmo loanId', async () => {
    prisma.notificacao.findUnique.mockResolvedValue({ id: 'exists-loan-g' });
    await notifyLoanGuaranteeCreditReleased({
      userId: 'test-user-id',
      loanId: 'loan-dup-g',
      movimentacaoId: 'mov-x',
      valor: 100,
    });
    expect(prisma.notificacao.create).not.toHaveBeenCalled();
  });
});
