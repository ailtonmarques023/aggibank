'use strict';

const {
  amountsMatchCob,
  RECONCILE_SUPPORTED_LINKED_TYPES,
  isEfiReconcileEligible,
  normalizeTxidInput,
  pickConfirmedPixFromCobPayload,
  pickPixFromReceivedListForCob,
  toWebhookPixItem,
} = require('../src/utils/efiReconcilePix');

describe('efiReconcilePix (Fase R)', () => {
  it('amountsMatchCob alinha centavos', () => {
    expect(amountsMatchCob(39.9, '39.90')).toBe(true);
    expect(amountsMatchCob(10, '9.99')).toBe(false);
  });

  it('pickConfirmedPixFromCobPayload exige valor e e2e', () => {
    const cob = { txid: 'abc', amount: 100 };
    const efi = {
      status: 'CONCLUIDA',
      pix: [{ endToEndId: 'E1', valor: '100.00', horario: '2026-01-01T12:00:00Z', txid: 'abc' }],
    };
    const p = pickConfirmedPixFromCobPayload(cob, efi);
    expect(p).toBeTruthy();
    expect(p.endToEndId).toBe('E1');
  });

  it('pickConfirmedPixFromCobPayload ignora txid divergente quando informado', () => {
    const cob = { txid: 'abc', amount: 100 };
    const efi = {
      pix: [{ endToEndId: 'E1', valor: '100.00', horario: '2026-01-01T12:00:00Z', txid: 'outro' }],
    };
    expect(pickConfirmedPixFromCobPayload(cob, efi)).toBeNull();
  });

  it('pickPixFromReceivedListForCob encontra por txid e valor', () => {
    const cob = { txid: 'tx1', amount: 5 };
    const list = {
      pix: [
        { endToEndId: 'E99', valor: '1.00', horario: '2026-01-01T12:00:00Z', txid: 'other' },
        { endToEndId: 'E2', valor: '5.00', horario: '2026-01-02T12:00:00Z', txid: 'tx1' },
      ],
    };
    const p = pickPixFromReceivedListForCob(cob, list);
    expect(p.endToEndId).toBe('E2');
  });

  it('toWebhookPixItem usa fallbackTxid', () => {
    const item = toWebhookPixItem(
      { endToEndId: 'E3', valor: '10.00', horario: '2026-01-03T10:00:00Z' },
      'fallbackTxid123456789012',
    );
    expect(item.txid).toBe('fallbackTxid123456789012');
    expect(item.endToEndId).toBe('E3');
  });

  it('normalizeTxidInput remove espacos e aspas externas', () => {
    expect(normalizeTxidInput('  "29gEKNvG7DBLhc4E9v8ozGn37f9W"  ')).toBe(
      '29gEKNvG7DBLhc4E9v8ozGn37f9W',
    );
    expect(normalizeTxidInput(" 'abc123' ")).toBe('abc123');
  });

  it('aceita account_deposit no recovery por txid sem remover tipos existentes', () => {
    expect(RECONCILE_SUPPORTED_LINKED_TYPES).toEqual(
      expect.arrayContaining(['account_deposit', 'loan_insurance', 'boleto', 'card_shipment']),
    );
    expect(isEfiReconcileEligible({
      txid: 'tx-account-deposit',
      provider: 'EFI',
      status: 'ATIVA',
      linkedEntityType: 'account_deposit',
    })).toBe(true);
  });

  it('mantem loan_insurance elegivel para recovery', () => {
    expect(isEfiReconcileEligible({
      txid: 'tx-loan-insurance',
      provider: 'EFI',
      status: 'CRIADA',
      linkedEntityType: 'loan_insurance',
    })).toBe(true);
  });

  it('rejeita provider, status ou tipo fora do contrato do recovery', () => {
    expect(isEfiReconcileEligible({
      txid: 'tx-provider',
      provider: 'OUTRO',
      status: 'ATIVA',
      linkedEntityType: 'account_deposit',
    })).toBe(false);
    expect(isEfiReconcileEligible({
      txid: 'tx-status',
      provider: 'EFI',
      status: 'PAGA',
      linkedEntityType: 'account_deposit',
    })).toBe(false);
    expect(isEfiReconcileEligible({
      txid: 'tx-type',
      provider: 'EFI',
      status: 'ATIVA',
      linkedEntityType: 'unsupported',
    })).toBe(false);
  });
});
