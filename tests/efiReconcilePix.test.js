'use strict';

const {
  amountsMatchCob,
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
});
