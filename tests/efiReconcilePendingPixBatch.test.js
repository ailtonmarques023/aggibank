'use strict';

const { prisma } = require('../src/config/database');
const {
  parseArgs,
  runRecoveryBatch,
} = require('../scripts/efi-reconcile-pending-pix-batch');

describe('efi-reconcile-pending-pix-batch (Fase U.5)', () => {
  const oldDate = new Date('2026-05-12T13:00:00.000Z');
  const now = new Date('2026-05-12T14:00:00.000Z');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function cob(overrides = {}) {
    return {
      id: 'pix-cob-1',
      userId: 'user-1',
      txid: 'txidBatchRecoveryU5abcdef123456',
      status: 'ATIVA',
      amount: 1,
      provider: 'EFI',
      linkedEntityType: 'account_deposit',
      linkedEntityId: 'dep-1',
      createdAt: oldDate,
      ...overrides,
    };
  }

  function deps(rows, efiCob, extra = {}) {
    prisma.pixCobranca.findMany.mockResolvedValue(rows);
    prisma.pixCobranca.findUnique.mockResolvedValue(rows[0] || null);
    return {
      prisma,
      now,
      efiPixClient: {
        isEfiPixConfigured: jest.fn(() => true),
        getCobByTxid: jest.fn(async () => efiCob),
      },
      processEfiPixWebhookBody: jest.fn(async () => ({
        ok: true,
        results: [{ result: 'PROCESSED', settlementResult: 'SETTLED' }],
      })),
      recordAudit: jest.fn(async () => ({})),
      ...extra,
    };
  }

  it('usa dry-run por padrao e normaliza parametros', () => {
    expect(parseArgs([])).toEqual(
      expect.objectContaining({
        dryRun: true,
        apply: false,
        limit: 20,
        minAgeMinutes: 5,
        days: 14,
      }),
    );

    expect(parseArgs(['--apply', '--limit=200', '--min-age-minutes=0', '--linked-type=account_deposit'])).toEqual(
      expect.objectContaining({
        dryRun: false,
        apply: true,
        limit: 100,
        minAgeMinutes: 0,
        linkedType: 'account_deposit',
      }),
    );
  });

  it('lista apenas PixCobranca EFI ATIVA elegivel com idade minima', async () => {
    const d = deps([], null);

    await runRecoveryBatch({ dryRun: true, linkedType: 'account_deposit', limit: 7, minAgeMinutes: 10 }, d);

    expect(prisma.pixCobranca.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          provider: 'EFI',
          status: 'ATIVA',
          linkedEntityType: { in: ['account_deposit'] },
          txid: { not: '' },
          createdAt: { lte: new Date('2026-05-12T13:50:00.000Z') },
        }),
        take: 7,
      }),
    );
  });

  it('dry-run confirma na Efi, mas nao chama pipeline mutante', async () => {
    const d = deps(
      [cob()],
      {
        status: 'CONCLUIDA',
        pix: [{ endToEndId: 'E2EBatchRecoveryU5DryRun', txid: 'txidBatchRecoveryU5abcdef123456', valor: '1.00' }],
      },
    );

    const report = await runRecoveryBatch({ dryRun: true }, d);

    expect(report.mode).toBe('dry-run');
    expect(report.scanned).toBe(1);
    expect(report.pending).toBe(1);
    expect(report.applied).toBe(0);
    expect(report.results[0]).toEqual(expect.objectContaining({
      reason: 'APPLIED',
      outcome: 'DRY_RUN_APPLY_READY',
      wouldApply: true,
    }));
    expect(d.processEfiPixWebhookBody).not.toHaveBeenCalled();
    expect(d.recordAudit).not.toHaveBeenCalled();
  });

  it('apply usa processEfiPixWebhookBody com source recovery e registra AuditLog', async () => {
    const d = deps(
      [cob()],
      {
        status: 'CONCLUIDA',
        pix: [{ endToEndId: 'E2EBatchRecoveryU5Apply', txid: 'txidBatchRecoveryU5abcdef123456', valor: '1.00' }],
      },
    );

    const report = await runRecoveryBatch({ apply: true, dryRun: false }, d);

    expect(report.mode).toBe('apply');
    expect(report.applied).toBe(1);
    expect(report.results[0]).toEqual(expect.objectContaining({
      reason: 'APPLIED',
      outcome: 'APPLIED',
      settlementResult: 'SETTLED',
    }));
    expect(d.processEfiPixWebhookBody).toHaveBeenCalledWith(
      { pix: [expect.objectContaining({ endToEndId: 'E2EBatchRecoveryU5Apply', valor: '1.00' })] },
      expect.objectContaining({
        source: 'recovery',
        requestPath: 'scripts/efi-reconcile-pending-pix-batch.js',
        requestId: 'efi-pix-recovery-batch:pix-cob-1',
      }),
    );
    expect(d.recordAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'efi.pix.recovery_batch.apply',
      entity: 'PixCobranca',
      entityId: 'pix-cob-1',
    }));
  });

  it('nao processa valor divergente', async () => {
    const d = deps(
      [cob()],
      {
        status: 'CONCLUIDA',
        pix: [{ endToEndId: 'E2EBatchRecoveryU5Mismatch', txid: 'txidBatchRecoveryU5abcdef123456', valor: '2.00' }],
      },
    );

    const report = await runRecoveryBatch({ apply: true, dryRun: false }, d);

    expect(report.skipped).toBe(1);
    expect(report.results[0].reason).toBe('AMOUNT_MISMATCH');
    expect(d.processEfiPixWebhookBody).not.toHaveBeenCalled();
    expect(d.recordAudit).not.toHaveBeenCalled();
  });

  it('nao processa quando Efi ainda esta pendente', async () => {
    const d = deps([cob()], { status: 'ATIVA', pix: [] });

    const report = await runRecoveryBatch({ apply: true, dryRun: false }, d);

    expect(report.pending).toBe(1);
    expect(report.results[0].reason).toBe('EFI_PENDING');
    expect(d.processEfiPixWebhookBody).not.toHaveBeenCalled();
  });

  it('mantem idempotencia quando pipeline retorna duplicado', async () => {
    const d = deps(
      [cob()],
      {
        status: 'CONCLUIDA',
        pix: [{ endToEndId: 'E2EBatchRecoveryU5Duplicate', txid: 'txidBatchRecoveryU5abcdef123456', valor: '1.00' }],
      },
      {
        processEfiPixWebhookBody: jest.fn(async () => ({
          ok: true,
          results: [{ result: 'DUPLICATE' }],
        })),
      },
    );

    const report = await runRecoveryBatch({ apply: true, dryRun: false }, d);

    expect(report.skipped).toBe(1);
    expect(report.results[0].reason).toBe('ALREADY_PAID');
    expect(d.recordAudit).not.toHaveBeenCalled();
  });

  it('txid especifico ja PAGA vira ALREADY_PAID sem consultar Efi', async () => {
    const d = deps([cob({ status: 'PAGA' })], null);

    const report = await runRecoveryBatch({ dryRun: true, txid: 'txidBatchRecoveryU5abcdef123456' }, d);

    expect(prisma.pixCobranca.findUnique).toHaveBeenCalled();
    expect(report.skipped).toBe(1);
    expect(report.results[0].reason).toBe('ALREADY_PAID');
    expect(d.efiPixClient.getCobByTxid).not.toHaveBeenCalled();
  });
});
