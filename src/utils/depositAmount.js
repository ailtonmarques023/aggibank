'use strict';

const { getTransactionLimits } = require('../config/transactionLimits');

/**
 * Valida e normaliza valor de depósito Pix (BRL).
 * Rejeita string malformada, mais de 2 casas decimais, zero, negativo, NaN, fora dos limites.
 *
 * @param {unknown} amountRaw
 * @returns {{ ok: true, value: number, cents: number } | { ok: false, code: string, message: string }}
 */
function parseValidatedDepositAmount(amountRaw) {
  const depositLimits = getTransactionLimits().deposit;

  if (amountRaw === undefined || amountRaw === null) {
    return { ok: false, code: 'INVALID_AMOUNT', message: 'Informe o valor do depósito.' };
  }

  if (typeof amountRaw === 'boolean') {
    return { ok: false, code: 'INVALID_AMOUNT', message: 'Valor do depósito inválido.' };
  }

  let normalized;
  if (typeof amountRaw === 'number') {
    if (!Number.isFinite(amountRaw) || amountRaw <= 0) {
      return { ok: false, code: 'INVALID_AMOUNT', message: 'Valor do depósito inválido.' };
    }
    if (Object.is(amountRaw, -0)) {
      return { ok: false, code: 'INVALID_AMOUNT', message: 'Valor do depósito inválido.' };
    }
    const s = String(amountRaw);
    if (/[eE]/.test(s)) {
      return { ok: false, code: 'INVALID_AMOUNT', message: 'Use um valor monetário sem notação científica.' };
    }
    normalized = s.replace(',', '.');
    if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
      return {
        ok: false,
        code: 'INVALID_AMOUNT',
        message: 'Use até duas casas decimais e apenas dígitos no valor.',
      };
    }
  } else {
    const t = String(amountRaw).trim();
    if (!t) {
      return { ok: false, code: 'INVALID_AMOUNT', message: 'Informe o valor do depósito.' };
    }
    if (/[eE]/.test(t)) {
      return { ok: false, code: 'INVALID_AMOUNT', message: 'Use um valor monetário sem notação científica.' };
    }
    normalized = t.replace(/\s/g, '').replace(',', '.');
  }

  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    return {
      ok: false,
      code: 'INVALID_AMOUNT',
      message: 'Use até duas casas decimais e apenas dígitos no valor.',
    };
  }

  const n = Number(normalized);
  if (!Number.isFinite(n) || n <= 0) {
    return { ok: false, code: 'INVALID_AMOUNT', message: 'Valor do depósito inválido.' };
  }

  const cents = Math.round(n * 100);
  const value = cents / 100;

  if (value < depositLimits.minAmount) {
    return {
      ok: false,
      code: 'AMOUNT_BELOW_MINIMUM',
      message: `O valor mínimo por depósito é R$ ${depositLimits.minAmount.toFixed(2).replace('.', ',')}.`,
    };
  }
  if (value > depositLimits.maxAmount) {
    return {
      ok: false,
      code: 'AMOUNT_ABOVE_LIMIT',
      message: `O valor máximo por depósito é R$ ${depositLimits.maxAmount.toFixed(2).replace('.', ',')}.`,
    };
  }

  return { ok: true, value, cents };
}

module.exports = {
  parseValidatedDepositAmount,
  get DEPOSIT_AMOUNT_MIN_BRL() {
    return getTransactionLimits().deposit.minAmount;
  },
  get DEPOSIT_AMOUNT_MAX_BRL() {
    return getTransactionLimits().deposit.maxAmount;
  },
};
