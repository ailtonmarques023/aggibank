const { prisma } = require('../src/config/database');
const emailUtils = require('../src/utils/email');
const {
  sendLoanApprovedBlockedEmailIfNeeded,
  ACAO_SEGURO,
  ACAO_GARANTIA,
} = require('../src/services/loanApprovedBlockedEmailService');

describe('loanApprovedBlockedEmailService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('envia e-mail com instrução de quitar seguro quando insuranceSelected é true', async () => {
    prisma.notificacao.findUnique.mockResolvedValue({
      id: 'n1',
      userId: 'u1',
      metadata: { loanId: 'l1', action: 'pay_insurance' },
    });
    prisma.user.findUnique.mockResolvedValue({
      email: 'a@b.com',
      nomeCompleto: 'Maria Silva',
    });
    prisma.notificacao.update.mockResolvedValue({});

    await sendLoanApprovedBlockedEmailIfNeeded({
      loanId: 'l1',
      userId: 'u1',
      insuranceSelected: true,
      valorAprovado: 1000,
    });

    expect(emailUtils.sendLoanApprovedBlockedEmail).toHaveBeenCalledWith(
      { email: 'a@b.com', nomeCompleto: 'Maria Silva' },
      { valor: 1000, acaoDesbloqueio: ACAO_SEGURO },
    );
    expect(ACAO_SEGURO).toContain('39,90');
    expect(prisma.notificacao.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'n1' },
        data: expect.objectContaining({
          metadata: expect.objectContaining({ emailSentAt: expect.any(String) }),
        }),
      }),
    );
  });

  it('envia e-mail com instrução de garantia quando insuranceSelected é false', async () => {
    prisma.notificacao.findUnique.mockResolvedValue({
      id: 'n2',
      userId: 'u1',
      metadata: { loanId: 'l2', action: 'submit_guarantee' },
    });
    prisma.user.findUnique.mockResolvedValue({
      email: 'a@b.com',
      nomeCompleto: 'João Souza',
    });
    prisma.notificacao.update.mockResolvedValue({});

    await sendLoanApprovedBlockedEmailIfNeeded({
      loanId: 'l2',
      userId: 'u1',
      insuranceSelected: false,
      valorAprovado: 2500,
    });

    expect(emailUtils.sendLoanApprovedBlockedEmail).toHaveBeenCalledWith(
      { email: 'a@b.com', nomeCompleto: 'João Souza' },
      { valor: 2500, acaoDesbloqueio: ACAO_GARANTIA },
    );
    expect(prisma.notificacao.update).toHaveBeenCalled();
  });

  it('não envia e-mail se não existir notificação in-app com o dedupeKey do empréstimo', async () => {
    prisma.notificacao.findUnique.mockResolvedValue(null);

    await sendLoanApprovedBlockedEmailIfNeeded({
      loanId: 'l-missing',
      userId: 'u1',
      insuranceSelected: false,
      valorAprovado: 100,
    });

    expect(emailUtils.sendLoanApprovedBlockedEmail).not.toHaveBeenCalled();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('não envia e-mail se userId da notificação não bater com o solicitante', async () => {
    prisma.notificacao.findUnique.mockResolvedValue({
      id: 'n1',
      userId: 'outro',
      metadata: {},
    });

    await sendLoanApprovedBlockedEmailIfNeeded({
      loanId: 'l1',
      userId: 'u1',
      insuranceSelected: false,
      valorAprovado: 100,
    });

    expect(emailUtils.sendLoanApprovedBlockedEmail).not.toHaveBeenCalled();
  });

  it('não reenvia se metadata já tiver emailSentAt', async () => {
    prisma.notificacao.findUnique.mockResolvedValue({
      id: 'n1',
      userId: 'u1',
      metadata: { loanId: 'l1', emailSentAt: '2026-05-09T10:00:00.000Z' },
    });

    await sendLoanApprovedBlockedEmailIfNeeded({
      loanId: 'l1',
      userId: 'u1',
      insuranceSelected: false,
      valorAprovado: 100,
    });

    expect(emailUtils.sendLoanApprovedBlockedEmail).not.toHaveBeenCalled();
    expect(prisma.notificacao.update).not.toHaveBeenCalled();
  });

  it('não atualiza metadata se o envio de e-mail falhar', async () => {
    prisma.notificacao.findUnique.mockResolvedValue({
      id: 'n1',
      userId: 'u1',
      metadata: { loanId: 'l1' },
    });
    prisma.user.findUnique.mockResolvedValue({
      email: 'a@b.com',
      nomeCompleto: 'X',
    });
    emailUtils.sendLoanApprovedBlockedEmail.mockRejectedValueOnce(new Error('smtp_fail'));

    await sendLoanApprovedBlockedEmailIfNeeded({
      loanId: 'l1',
      userId: 'u1',
      insuranceSelected: true,
      valorAprovado: 500,
    });

    expect(prisma.notificacao.update).not.toHaveBeenCalled();
  });
});
