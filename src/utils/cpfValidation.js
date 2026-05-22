'use strict';

/**
 * Validação de CPF (11 dígitos + dígitos verificadores).
 * Não registrar o valor completo em logs — usar apenas booleanos agregados.
 */

/**
 * @param {string | number | null | undefined} raw
 * @returns {string | null} Apenas dígitos ou null se vazio/inválido de formato
 */
function normalizeCpfDigits(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (digits.length === 0) return null;
  return digits;
}

/**
 * @param {string | number | null | undefined} raw
 * @returns {boolean}
 */
function isValidCpf(raw) {
  const cpf = normalizeCpfDigits(raw);
  if (!cpf || cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(cpf.charAt(i), 10) * (10 - i);
  }
  let remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(cpf.charAt(9), 10)) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(cpf.charAt(i), 10) * (11 - i);
  }
  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(cpf.charAt(10), 10)) return false;

  return true;
}

module.exports = {
  normalizeCpfDigits,
  isValidCpf,
};
