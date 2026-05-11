'use strict';

/**
 * Datas do extrato de conciliação Efí em fuso America/Sao_Paulo (regra operacional do script S.4).
 * A Efí exige dataMovimento **anterior** à data corrente (dia civil em SP).
 */

function saoPauloDateKey(d) {
  if (!d || !(d instanceof Date) || Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function todaySaoPauloDateKey(now = new Date()) {
  return saoPauloDateKey(now);
}

/**
 * @param {{ explicitDate?: string|null, paidAt?: Date|null }} p
 * @returns {string|null} YYYY-MM-DD para POST extrato-conciliacao
 */
function resolveDataMovimento(p) {
  const ex = p.explicitDate != null ? String(p.explicitDate).trim() : '';
  if (ex) return ex;
  return saoPauloDateKey(p.paidAt);
}

/**
 * @param {string} dataMovimento YYYY-MM-DD
 * @param {Date} [now]
 * @returns {{ ok: true, todaySaoPaulo: string, dataMovimento: string } | { ok: false, code: string, todaySaoPaulo: string, dataMovimento: string }}
 */
function validateDataMovimentoBeforeExtrato(dataMovimento, now = new Date()) {
  const dm = String(dataMovimento || '').trim();
  const today = todaySaoPauloDateKey(now);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dm)) {
    return { ok: false, code: 'INVALID_DATE_FORMAT', todaySaoPaulo: today, dataMovimento: dm };
  }
  if (dm >= today) {
    return { ok: false, code: 'DATE_NOT_AVAILABLE_YET', todaySaoPaulo: today, dataMovimento: dm };
  }
  return { ok: true, todaySaoPaulo: today, dataMovimento: dm };
}

module.exports = {
  saoPauloDateKey,
  todaySaoPauloDateKey,
  resolveDataMovimento,
  validateDataMovimentoBeforeExtrato,
};
