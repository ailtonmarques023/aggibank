const { prisma } = require('../src/config/database');
const emailUtils = require('../src/utils/email');
const { sendCardApprovedEmailIfNeeded } = require('../src/services/cardApprovedEmailService');

describe('cardApprovedEmailService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('envia e-mail com limite aprovado quando notificação existe', async () => {
    prisma.notificacao.findUnique.mockResolvedValue({
      id: 'n1',
      userId: 'u1',
      metadata: { cardId: 'c1', action: 'view_card' },
    });
    prisma.user.findUnique.mockResolvedValue({
      email: 'a@b.com',
      nomeCompleto: 'Maria Silva',
    });
    prisma.notificacao.update.mockResolvedValue({});

    await sendCardApprovedEmailIfNeeded({
      cardId: 'c1',
      userId: 'u1',
      limiteAprovado: 3200.5,
      status: 'aprovado',
    });

    expect(emailUtils.sendCardApprovedEmail).toHaveBeenCalledWith(
      { email: 'a@b.com', nomeCompleto: 'Maria Silva' },
      { limite: 3200.5, status: 'aprovado' },
    );
    expect(prisma.notificacao.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.objectContaining({ emailSentAt: expect.any(String) }),
        }),
      }),
    );
  });

  it('não envia sem notificação in-app', async () => {
    prisma.notificacao.findUnique.mockResolvedValue(null);
    await sendCardApprovedEmailIfNeeded({
      cardId: 'c-x',
      userId: 'u1',
      limiteAprovado: 100,
      status: 'aprovado',
    });
    expect(emailUtils.sendCardApprovedEmail).not.toHaveBeenCalled();
  });

  it('não envia se userId da notificação divergir', async () => {
    prisma.notificacao.findUnique.mockResolvedValue({
      id: 'n1',
      userId: 'outro',
      metadata: {},
    });
    await sendCardApprovedEmailIfNeeded({
      cardId: 'c1',
      userId: 'u1',
      limiteAprovado: 100,
      status: 'aprovado',
    });
    expect(emailUtils.sendCardApprovedEmail).not.toHaveBeenCalled();
  });

  it('não reenvia se emailSentAt já existir', async () => {
    prisma.notificacao.findUnique.mockResolvedValue({
      id: 'n1',
      userId: 'u1',
      metadata: { emailSentAt: '2026-01-01T00:00:00.000Z' },
    });
    await sendCardApprovedEmailIfNeeded({
      cardId: 'c1',
      userId: 'u1',
      limiteAprovado: 100,
      status: 'aprovado',
    });
    expect(emailUtils.sendCardApprovedEmail).not.toHaveBeenCalled();
  });

  it('não atualiza metadata se envio falhar', async () => {
    prisma.notificacao.findUnique.mockResolvedValue({
      id: 'n1',
      userId: 'u1',
      metadata: { cardId: 'c1' },
    });
    prisma.user.findUnique.mockResolvedValue({ email: 'a@b.com', nomeCompleto: 'X' });
    emailUtils.sendCardApprovedEmail.mockRejectedValueOnce(new Error('fail'));
    await sendCardApprovedEmailIfNeeded({
      cardId: 'c1',
      userId: 'u1',
      limiteAprovado: 500,
      status: 'aprovado',
    });
    expect(prisma.notificacao.update).not.toHaveBeenCalled();
  });

  it('não envia com limite inválido', async () => {
    prisma.notificacao.findUnique.mockResolvedValue({
      id: 'n1',
      userId: 'u1',
      metadata: {},
    });
    prisma.user.findUnique.mockResolvedValue({ email: 'a@b.com', nomeCompleto: 'X' });
    await sendCardApprovedEmailIfNeeded({
      cardId: 'c1',
      userId: 'u1',
      limiteAprovado: 0,
      status: 'aprovado',
    });
    expect(emailUtils.sendCardApprovedEmail).not.toHaveBeenCalled();
  });
});
