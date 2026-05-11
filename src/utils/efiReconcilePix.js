'use strict';

/**
 * Helpers para conciliação Pix Efí (Fase R): escolher linha de Pix recebido compatível com PixCobranca,
 * sem criar nova cobrança. Valores comparados em centavos como no webhook.
 */

function moneyCents(n) {
  const x = Number(String(n).replace(',', '.'));
  if (!Number.isFinite(x)) return null;
  return Math.round(x * 100);
}

function amountsMatchCob(cobAmount, receivedValor) {
  const a = moneyCents(cobAmount);
  const b = moneyCents(receivedValor);
  if (a == null || b == null) return false;
  return a === b;
}

/**
 * @param {object} cob — linha PixCobranca (amount, txid)
 * @param {object} efiCobPayload — corpo GET /v2/cob/:txid
 * @returns {object|null} — elemento de `pix[]` ou null
 */
function pickConfirmedPixFromCobPayload(cob, efiCobPayload) {
  if (!cob || !efiCobPayload || typeof efiCobPayload !== 'object') return null;
  const items = efiCobPayload.pix;
  if (!Array.isArray(items) || items.length === 0) return null;
  const wantTxid = String(cob.txid || '').trim();
  for (const p of items) {
    if (!p || typeof p !== 'object') continue;
    const e2e = p.endToEndId != null ? String(p.endToEndId).trim() : '';
    if (!e2e) continue;
    if (!amountsMatchCob(cob.amount, p.valor)) continue;
    const pTxid = p.txid != null ? String(p.txid).trim() : '';
    if (pTxid && wantTxid && pTxid !== wantTxid) continue;
    return p;
  }
  return null;
}

/**
 * @param {object} cob
 * @param {object} listPayload — corpo GET /v2/pix?inicio&fim[&txid]
 * @returns {object|null}
 */
function pickPixFromReceivedListForCob(cob, listPayload) {
  if (!cob || !listPayload || typeof listPayload !== 'object') return null;
  const items = listPayload.pix;
  if (!Array.isArray(items) || items.length === 0) return null;
  const wantTxid = String(cob.txid || '').trim();
  for (const p of items) {
    if (!p || typeof p !== 'object') continue;
    const e2e = p.endToEndId != null ? String(p.endToEndId).trim() : '';
    if (!e2e) continue;
    const pTxid = p.txid != null ? String(p.txid).trim() : '';
    if (wantTxid && pTxid && pTxid !== wantTxid) continue;
    if (!amountsMatchCob(cob.amount, p.valor)) continue;
    return p;
  }
  return null;
}

/**
 * Monta item no formato esperado por `processEfiPixWebhookBody({ pix: [...] })`.
 * @param {object} p — objeto retornado pela Efí (endToEndId, valor, horario, txid)
 * @param {string} fallbackTxid — txid da cobrança local se a Efí omitir no item
 */
function toWebhookPixItem(p, fallbackTxid) {
  const endToEndId = p.endToEndId != null ? String(p.endToEndId).trim() : '';
  const valor = p.valor != null ? String(p.valor).trim() : '';
  const horario = p.horario != null ? String(p.horario).trim() : '';
  const txid = p.txid != null && String(p.txid).trim() ? String(p.txid).trim() : String(fallbackTxid || '').trim();
  return { endToEndId, valor, horario, txid };
}

module.exports = {
  moneyCents,
  amountsMatchCob,
  pickConfirmedPixFromCobPayload,
  pickPixFromReceivedListForCob,
  toWebhookPixItem,
};
