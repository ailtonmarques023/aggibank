'use strict';

const {
  parseValidatedDepositAmount,
  DEPOSIT_AMOUNT_MIN_BRL,
  DEPOSIT_AMOUNT_MAX_BRL,
} = require('../src/utils/depositAmount');

describe('depositAmount.parseValidatedDepositAmount', () => {
  it('aceita inteiro e decimal com vírgula ou ponto', () => {
    expect(parseValidatedDepositAmount(50).ok).toBe(true);
    if (parseValidatedDepositAmount(50).ok) {
      expect(parseValidatedDepositAmount(50).value).toBe(50);
    }
    expect(parseValidatedDepositAmount('1,50').ok).toBe(true);
    if (parseValidatedDepositAmount('1,50').ok) {
      expect(parseValidatedDepositAmount('1,50').value).toBe(1.5);
    }
    expect(parseValidatedDepositAmount('5000.00').ok).toBe(true);
  });

  it('rejeita mais de duas casas decimais', () => {
    const r = parseValidatedDepositAmount('10.001');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('INVALID_AMOUNT');
    const r2 = parseValidatedDepositAmount(10.001);
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.code).toBe('INVALID_AMOUNT');
  });

  it('rejeita zero e negativo', () => {
    expect(parseValidatedDepositAmount(0).ok).toBe(false);
    expect(parseValidatedDepositAmount(-1).ok).toBe(false);
    expect(parseValidatedDepositAmount('0').ok).toBe(false);
  });

  it('AMOUNT_BELOW_MINIMUM abaixo de R$ 1', () => {
    const r = parseValidatedDepositAmount('0.99');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('AMOUNT_BELOW_MINIMUM');
  });

  it('AMOUNT_ABOVE_LIMIT acima do máximo', () => {
    const r = parseValidatedDepositAmount('5000.01');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('AMOUNT_ABOVE_LIMIT');
  });

  it('constantes de produto', () => {
    expect(DEPOSIT_AMOUNT_MIN_BRL).toBe(1);
    expect(DEPOSIT_AMOUNT_MAX_BRL).toBe(5000);
  });
});
