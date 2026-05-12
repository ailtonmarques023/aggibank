'use strict';

jest.mock('../src/utils/auditLog', () => ({
  recordAudit: jest.fn(() => Promise.resolve()),
}));

jest.mock('../src/services/pixSettlementService', () => ({
  settlePaidPixCobrancaInTx: jest.fn().mockResolvedValue({
    settlementResult: 'UNSUPPORTED_ENTITY',
  }),
}));

const { prisma } = require('../src/config/database');
const { settlePaidPixCobrancaInTx } = require('../src/services/pixSettlementService');
const {
  processEfiPixWebhookBody,
  sanitizeForStorage,
  buildIdempotencyKey,
} = require('../src/services/pixEfiWebhookService');

describe('pixEfiWebhookService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(async (cb) => cb(prisma));
    settlePaidPixCobrancaInTx.mockResolvedValue({
      settlementResult: 'UNSUPPORTED_ENTITY',
    });
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
    const receivedAt = new Date('2026-05-12T14:00:00.000Z');
    prisma.pixWebhookEvent.findUnique.mockResolvedValue(null);
    prisma.pixCobranca.findUnique.mockResolvedValue({
      id: 'cob1',
      userId: 'u1',
      amount: 39.9,
      status: 'ATIVA',
    });
    prisma.pixCobranca.update.mockResolvedValue({});
    prisma.pixWebhookEvent.create.mockResolvedValue({ id: 'ev1' });
    prisma.pixWebhookEvent.update.mockResolvedValue({});

    const r = await processEfiPixWebhookBody(
      {
        pix: [
          {
            endToEndId: 'E2EUnitTestPixWebhookFaseO01',
            txid: 'txidUnitTestPixWebhookFaseO01',
            valor: '39.90',
            horario: '2026-05-11T15:00:00.000Z',
            pixCopiaECola: '000201SECRET',
          },
        ],
      },
      {
        requestId: 'req-1',
        ip: '127.0.0.1',
        source: 'webhook_auto',
        requestPath: '/api/internal/efi/pix/webhook/pix?ignorar=&efiwk=secret-token',
        requestMethod: 'post',
        httpStatus: 200,
        receivedAt,
      },
    );

    expect(r.ok).toBe(true);
    expect(r.results[0].result).toBe('PROCESSED');
    expect(r.results[0].settlementResult).toBe('UNSUPPORTED_ENTITY');
    expect(prisma.pixCobranca.update).toHaveBeenCalled();
    const up = prisma.pixCobranca.update.mock.calls[0][0];
    expect(up.data.status).toBe('PAGA');
    expect(up.data.endToEndId).toBe('E2EUnitTestPixWebhookFaseO01');
    expect(prisma.pixWebhookEvent.create).toHaveBeenCalled();
    const createData = prisma.pixWebhookEvent.create.mock.calls[0][0].data;
    expect(createData.source).toBe('webhook_auto');
    expect(createData.requestPath).toBe('/api/internal/efi/pix/webhook/pix?ignorar=&efiwk=***');
    expect(createData.requestMethod).toBe('POST');
    expect(createData.httpStatus).toBe(200);
    expect(createData.receivedAt).toBe(receivedAt);
    expect(createData.providerEventId).toBe('E2EUnitTestPixWebhookFaseO01');
    expect(createData.metadata.item.pixCopiaECola).toBe('[redacted]');
    expect(JSON.stringify(createData)).not.toContain('secret-token');
    expect(prisma.pixWebhookEvent.update).toHaveBeenCalled();
    const upd = prisma.pixWebhookEvent.update.mock.calls[0][0];
    expect(upd.where.id).toBe('ev1');
    const updData = upd.data;
    expect(updData.settlementResult).toBe('UNSUPPORTED_ENTITY');
    expect(settlePaidPixCobrancaInTx).toHaveBeenCalled();
  });

  it('PROCESSED persiste taxa via gnExtras.tarifa quando enviada pela Efí', async () => {
    prisma.pixWebhookEvent.findUnique.mockResolvedValue(null);
    prisma.pixCobranca.findUnique.mockResolvedValue({
      id: 'cob1',
      userId: 'u1',
      amount: 10,
      status: 'ATIVA',
    });
    prisma.pixCobranca.update.mockResolvedValue({});
    prisma.pixWebhookEvent.create.mockResolvedValue({ id: 'ev-gn' });
    prisma.pixWebhookEvent.update.mockResolvedValue({});

    await processEfiPixWebhookBody(
      {
        pix: [
          {
            endToEndId: 'E2EGnExtrasTarifa01',
            txid: 'txidGnExtrasTarifa01',
            valor: '10.00',
            horario: '2026-05-11T15:00:00.000Z',
            gnExtras: { tarifa: '0.43' },
          },
        ],
      },
      {},
    );

    const up = prisma.pixCobranca.update.mock.calls[0][0];
    expect(up.data.grossAmount).toBe(10);
    expect(up.data.providerFeeAmount).toBe(0.43);
    expect(up.data.netAmount).toBe(9.57);
    expect(up.data.providerFeeSource).toBe('efi_pix_webhook_gn_extras');
  });

  it('PROCESSED persiste settlementResult SETTLED quando settlement retorna SETTLED', async () => {
    settlePaidPixCobrancaInTx.mockResolvedValueOnce({ settlementResult: 'SETTLED' });

    prisma.pixWebhookEvent.findUnique.mockResolvedValue(null);
    prisma.pixCobranca.findUnique.mockResolvedValue({
      id: 'cob1',
      userId: 'u1',
      amount: 39.9,
      status: 'ATIVA',
    });
    prisma.pixCobranca.update.mockResolvedValue({});
    prisma.pixWebhookEvent.create.mockResolvedValue({ id: 'ev-settled' });
    prisma.pixWebhookEvent.update.mockResolvedValue({});

    const r = await processEfiPixWebhookBody(
      {
        pix: [
          {
            endToEndId: 'E2EUnitTestPixWebhookFaseO01-SETTLED',
            txid: 'txidUnitTestPixWebhookFaseO01-SETTLED',
            valor: '39.90',
            horario: '2026-05-11T15:00:00.000Z',
          },
        ],
      },
      {},
    );

    expect(r.ok).toBe(true);
    expect(r.results[0].result).toBe('PROCESSED');
    expect(r.results[0].settlementResult).toBe('SETTLED');
    expect(prisma.pixWebhookEvent.update).toHaveBeenCalled();
    const upd = prisma.pixWebhookEvent.update.mock.calls[0][0];
    expect(upd.where.id).toBe('ev-settled');
    expect(upd.data.settlementResult).toBe('SETTLED');
  });

  it('PROCESSED persiste settlementResult ALREADY_SETTLED quando settlement retorna ALREADY_SETTLED', async () => {
    settlePaidPixCobrancaInTx.mockResolvedValueOnce({ settlementResult: 'ALREADY_SETTLED' });

    prisma.pixWebhookEvent.findUnique.mockResolvedValue(null);
    prisma.pixCobranca.findUnique.mockResolvedValue({
      id: 'cob1',
      userId: 'u1',
      amount: 39.9,
      status: 'ATIVA',
    });
    prisma.pixCobranca.update.mockResolvedValue({});
    prisma.pixWebhookEvent.create.mockResolvedValue({ id: 'ev-already' });
    prisma.pixWebhookEvent.update.mockResolvedValue({});

    const r = await processEfiPixWebhookBody(
      {
        pix: [
          {
            endToEndId: 'E2EUnitTestPixWebhookFaseO01-ALREADY',
            txid: 'txidUnitTestPixWebhookFaseO01-ALREADY',
            valor: '39.90',
            horario: '2026-05-11T15:00:00.000Z',
          },
        ],
      },
      {},
    );

    expect(r.ok).toBe(true);
    expect(r.results[0].result).toBe('PROCESSED');
    expect(r.results[0].settlementResult).toBe('ALREADY_SETTLED');
    expect(prisma.pixWebhookEvent.update).toHaveBeenCalled();
    const upd = prisma.pixWebhookEvent.update.mock.calls[0][0];
    expect(upd.where.id).toBe('ev-already');
    expect(upd.data.settlementResult).toBe('ALREADY_SETTLED');
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

  it('recovery persiste source=recovery sem alterar idempotência', async () => {
    prisma.pixWebhookEvent.findUnique.mockResolvedValue(null);
    prisma.pixCobranca.findUnique.mockResolvedValue(null);
    prisma.pixWebhookEvent.create.mockResolvedValue({ id: 'ev-recovery' });

    const r = await processEfiPixWebhookBody(
      {
        pix: [
          {
            endToEndId: 'E2ERecoveryUnitTestPixWebhookU4',
            txid: 'txidRecoveryUnitTestPixWebhookU4',
            valor: '1.00',
          },
        ],
      },
      {
        requestId: 'efi-reconcile:cob1',
        source: 'recovery',
        requestPath: 'scripts/efi-reconcile-received-pix.js',
        receivedAt: '2026-05-12T14:10:00.000Z',
      },
    );

    expect(r.results[0].result).toBe('ORPHAN_TXID');
    const createData = prisma.pixWebhookEvent.create.mock.calls[0][0].data;
    expect(createData.idempotencyKey).toBe('efi:e2e:E2ERecoveryUnitTestPixWebhookU4');
    expect(createData.source).toBe('recovery');
    expect(createData.requestPath).toBe('scripts/efi-reconcile-received-pix.js');
    expect(createData.receivedAt).toEqual(new Date('2026-05-12T14:10:00.000Z'));
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
    expect(prisma.pixWebhookEvent.update).not.toHaveBeenCalled();
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
    expect(prisma.pixWebhookEvent.update).not.toHaveBeenCalled();
  });
});
