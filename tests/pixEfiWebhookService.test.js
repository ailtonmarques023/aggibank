'use strict';

jest.mock('../src/utils/auditLog', () => ({
  recordAudit: jest.fn(() => Promise.resolve()),
}));

const { prisma } = require('../src/config/database');
const {
  processEfiPixWebhookBody,
  sanitizeForStorage,
  buildIdempotencyKey,
} = require('../src/services/pixEfiWebhookService');

describe('pixEfiWebhookService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(async (cb) => cb(prisma));
  });

  it('sanitizeForStorage redige chave sensível', () => {
    const o = sanitizeForStorage({ pixCopiaECola: '000201SECRET', valor: '10.00' });
    expect(o.pixCopiaECola).toBe('[redacted]');
    expect(o.valor).toBe('10.00');
  });

  it('buildIdempotencyKey usa endToEndId', () => {
    expect(buildIdempotencyKey('E123')).toBe('efi:e2e:E123');
  });

  it('INVALID_BODY quando corpo não é objeto', async () => {
    const r = await processEfiPixWebhookBody(null, {});
    expect(r.ok).toBe(false);
    expect(r.code).toBe('INVALID_BODY');
  });

  it('NO_PIX_ITEMS quando pix vazio', async () => {
    const r = await processEfiPixWebhookBody({ pix: [] }, {});
    expect(r.ok).toBe(true);
    expect(r.code).toBe('NO_PIX_ITEMS');
  });

  it('DUPLICATE quando idempotency já existe', async () => {
    prisma.pixWebhookEvent.findUnique.mockResolvedValue({ id: 'dup' });
    const r = await processEfiPixWebhookBody(
      {
        pix: [{ endToEndId: 'E1', txid: 't1', valor: '10.00', horario: '2026-05-11T12:00:00.000Z' }],
      },
      {},
    );
    expect(r.results[0].result).toBe('DUPLICATE');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('PROCESSED atualiza PixCobranca e cria evento', async () => {
    prisma.pixWebhookEvent.findUnique.mockResolvedValue(null);
    prisma.pixCobranca.findUnique.mockResolvedValue({
      id: 'cob1',
      userId: 'u1',
      amount: 39.9,
      status: 'ATIVA',
    });
    prisma.pixCobranca.update.mockResolvedValue({});
    prisma.pixWebhookEvent.create.mockResolvedValue({ id: 'ev1' });

    const r = await processEfiPixWebhookBody(
      {
        pix: [
          {
            endToEndId: 'E2EUnitTestPixWebhookFaseO01',
            txid: 'txidUnitTestPixWebhookFaseO01',
            valor: '39.90',
            horario: '2026-05-11T15:00:00.000Z',
          },
        ],
      },
      { requestId: 'req-1', ip: '127.0.0.1' },
    );

    expect(r.ok).toBe(true);
    expect(r.results[0].result).toBe('PROCESSED');
    expect(prisma.pixCobranca.update).toHaveBeenCalled();
    const up = prisma.pixCobranca.update.mock.calls[0][0];
    expect(up.data.status).toBe('PAGA');
    expect(up.data.endToEndId).toBe('E2EUnitTestPixWebhookFaseO01');
    expect(prisma.pixWebhookEvent.create).toHaveBeenCalled();
  });

  it('ORPHAN_TXID quando txid não existe no banco', async () => {
    prisma.pixWebhookEvent.findUnique.mockResolvedValue(null);
    prisma.pixCobranca.findUnique.mockResolvedValue(null);
    prisma.pixWebhookEvent.create.mockResolvedValue({ id: 'ev2' });

    const r = await processEfiPixWebhookBody(
      {
        pix: [
          {
            endToEndId: 'E2EOrphanUnitTestPixWebhookO1',
            txid: 'txidNaoExisteNoBanco123456',
            valor: '1.00',
            horario: '2026-05-11T15:00:00.000Z',
          },
        ],
      },
      {},
    );

    expect(r.results[0].result).toBe('ORPHAN_TXID');
    expect(prisma.pixCobranca.update).not.toHaveBeenCalled();
  });

  it('AMOUNT_MISMATCH não atualiza cobrança', async () => {
    prisma.pixWebhookEvent.findUnique.mockResolvedValue(null);
    prisma.pixCobranca.findUnique.mockResolvedValue({
      id: 'cob1',
      userId: 'u1',
      amount: 39.9,
      status: 'ATIVA',
    });
    prisma.pixWebhookEvent.create.mockResolvedValue({ id: 'ev3' });

    const r = await processEfiPixWebhookBody(
      {
        pix: [
          {
            endToEndId: 'E2EMismatchUnitTestPixWebhook1',
            txid: 'txidUnitTestPixWebhookFaseO01',
            valor: '99.99',
            horario: '2026-05-11T15:00:00.000Z',
          },
        ],
      },
      {},
    );

    expect(r.results[0].result).toBe('AMOUNT_MISMATCH');
    expect(prisma.pixCobranca.update).not.toHaveBeenCalled();
  });

  it('ALREADY_PAID quando cob já está PAGA', async () => {
    prisma.pixWebhookEvent.findUnique.mockResolvedValue(null);
    prisma.pixCobranca.findUnique.mockResolvedValue({
      id: 'cob1',
      userId: 'u1',
      amount: 39.9,
      status: 'PAGA',
    });
    prisma.pixWebhookEvent.create.mockResolvedValue({ id: 'ev4' });

    const r = await processEfiPixWebhookBody(
      {
        pix: [
          {
            endToEndId: 'E2EAlreadyPaidUnitTestWebhook1',
            txid: 'txidUnitTestPixWebhookFaseO01',
            valor: '39.90',
            horario: '2026-05-11T15:00:00.000Z',
          },
        ],
      },
      {},
    );

    expect(r.results[0].result).toBe('ALREADY_PAID');
    expect(prisma.pixCobranca.update).not.toHaveBeenCalled();
  });
});
