'use strict';

const {
  saoPauloDateKey,
  resolveDataMovimento,
  validateDataMovimentoBeforeExtrato,
} = require('../src/utils/efiReconcileFeeExtratoDate');

describe('efiReconcileFeeExtratoDate (Fase S.4 — dataMovimento extrato)', () => {
  it('resolveDataMovimento: --date explícito vence paidAt para o POST na Efí', () => {
    const paidAt = new Date('2026-05-11T15:00:00.000Z');
    expect(resolveDataMovimento({ explicitDate: '2026-05-10', paidAt })).toBe('2026-05-10');
  });

  it('resolveDataMovimento: sem --date deriva dia civil SP a partir de paidAt', () => {
    const paidAt = new Date('2026-05-10T15:00:00.000Z');
    expect(saoPauloDateKey(paidAt)).toBe('2026-05-10');
    expect(resolveDataMovimento({ explicitDate: null, paidAt })).toBe('2026-05-10');
  });

  it('validateDataMovimentoBeforeExtrato: data igual ao “hoje” em SP retorna DATE_NOT_AVAILABLE_YET (sem chamar Efí)', () => {
    const now = new Date('2026-05-11T12:00:00.000Z');
    const todaySp = saoPauloDateKey(now);
    const r = validateDataMovimentoBeforeExtrato(todaySp, now);
    expect(r.ok).toBe(false);
    expect(r.code).toBe('DATE_NOT_AVAILABLE_YET');
    expect(r.dataMovimento).toBe(todaySp);
    expect(r.todaySaoPaulo).toBe(todaySp);
  });

  it('validateDataMovimentoBeforeExtrato: dia anterior ao “hoje” em SP é aceito', () => {
    const now = new Date('2026-05-11T12:00:00.000Z');
    const r = validateDataMovimentoBeforeExtrato('2026-05-10', now);
    expect(r.ok).toBe(true);
    expect(r.dataMovimento).toBe('2026-05-10');
  });

  it('validateDataMovimentoBeforeExtrato: formato inválido', () => {
    const now = new Date('2026-05-11T12:00:00.000Z');
    const r = validateDataMovimentoBeforeExtrato('10-05-2026', now);
    expect(r.ok).toBe(false);
    expect(r.code).toBe('INVALID_DATE_FORMAT');
  });
});
