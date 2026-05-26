'use strict';

const crypto = require('crypto');

/**
 * Cálculo e quote de promoção de cobranças (Fatia 1 — puro, sem persistência/Pix).
 *
 * Tipos públicos (GET /api/charges): gru_boleto | loan_insurance | card_shipping
 * Tipos internos (settlement/PixCobranca): boleto | loan_insurance | card_shipment
 */

const DEFAULT_DISCOUNT_PERCENT = 15;
const MIN_OPEN_CHARGES_FOR_PROMOTION = 2;

/** Status considerados em aberto / pagáveis na listagem de cobranças. */
const OPEN_CHARGE_STATUSES = new Set(['pendente', 'vencido']);

/** Status que excluem a cobrança do quote promocional. */
const CLOSED_CHARGE_STATUSES = new Set([
  'pago',
  'paid',
  'debitado',
  'cancelado',
  'cancelled',
  'canceled',
  'recusado',
  'expired',
  'expirado',
  'paga',
  'conciliada',
]);

const PUBLIC_CHARGE_PREFIX = {
  blt: 'gru_boleto',
  lic: 'loan_insurance',
  csh: 'card_shipping',
};

const PUBLIC_TO_LINKED_ENTITY_TYPE = {
  gru_boleto: 'boleto',
  loan_insurance: 'loan_insurance',
  card_shipping: 'card_shipment',
};

const PREFIX_TO_LINKED_ENTITY_TYPE = {
  blt: 'boleto',
  lic: 'loan_insurance',
  csh: 'card_shipment',
};

function normalizeStatusKey(raw) {
  return String(raw || '').trim().toLowerCase();
}

/**
 * Converte valor BRL (number ou string) para centavos inteiros.
 * @param {number|string} amountBrl
 * @returns {number|null}
 */
function amountBrlToCents(amountBrl) {
  const n = Number(String(amountBrl).replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

/**
 * Desconto em centavos: arredondamento matemático (half up via Math.round).
 * @param {number} originalAmountCents
 * @param {number} discountPercent
 * @returns {number}
 */
function calculateDiscountCents(originalAmountCents, discountPercent) {
  const original = Math.trunc(originalAmountCents);
  const percent = Math.trunc(discountPercent);
  if (original < 0 || percent < 0 || percent > 100) {
    throw new Error('CHARGE_PROMOTION_INVALID_AMOUNT_OR_PERCENT');
  }
  return Math.round((original * percent) / 100);
}

/**
 * Valor promocional em centavos após desconto percentual.
 * @param {number} originalAmountCents
 * @param {number} discountPercent
 * @returns {number}
 */
function calculatePromotionalAmountCents(originalAmountCents, discountPercent) {
  const original = Math.trunc(originalAmountCents);
  const discount = calculateDiscountCents(original, discountPercent);
  return original - discount;
}

function isChargeOpen(charge) {
  if (!charge || typeof charge !== 'object') return false;
  const status = normalizeStatusKey(charge.status);
  if (!status) return false;
  if (CLOSED_CHARGE_STATUSES.has(status)) return false;
  return OPEN_CHARGE_STATUSES.has(status);
}

/**
 * Resolve vínculo público ↔ entidade interna a partir do payload de cobrança.
 * Aceita campos explícitos ou deriva de `id` (blt_/lic_/csh_) + `type`.
 *
 * @param {object} charge
 * @returns {{ publicChargeId: string, publicChargeType: string, linkedEntityType: string, linkedEntityId: string }|null}
 */
function resolveChargeLinkage(charge) {
  if (!charge || typeof charge !== 'object') return null;

  const publicChargeId = String(charge.id || charge.publicChargeId || '').trim();
  if (!publicChargeId) return null;

  const idx = publicChargeId.indexOf('_');
  if (idx <= 0) return null;

  const prefix = publicChargeId.slice(0, idx);
  const linkedEntityId = publicChargeId.slice(idx + 1);
  if (!linkedEntityId) return null;

  let publicChargeType = String(charge.type || charge.publicChargeType || '').trim();
  if (!publicChargeType && PUBLIC_CHARGE_PREFIX[prefix]) {
    publicChargeType = PUBLIC_CHARGE_PREFIX[prefix];
  }

  let linkedEntityType = String(charge.linkedEntityType || '').trim();
  if (!linkedEntityType && publicChargeType && PUBLIC_TO_LINKED_ENTITY_TYPE[publicChargeType]) {
    linkedEntityType = PUBLIC_TO_LINKED_ENTITY_TYPE[publicChargeType];
  }
  if (!linkedEntityType && PREFIX_TO_LINKED_ENTITY_TYPE[prefix]) {
    linkedEntityType = PREFIX_TO_LINKED_ENTITY_TYPE[prefix];
  }

  if (!publicChargeType || !linkedEntityType) return null;

  return {
    publicChargeId,
    publicChargeType,
    linkedEntityType,
    linkedEntityId,
  };
}

function itemDedupeKey(item) {
  return `${item.linkedEntityType}:${item.linkedEntityId}`;
}

/**
 * Chave idempotente para persistência (Fatia 2+): mesmo usuário + mesmo conjunto de cobranças → mesma promo.
 * @param {string} userId
 * @param {Array<{ linkedEntityType: string, linkedEntityId: string }>} items
 * @returns {string}
 */
function buildPromotionIdempotencyKey(userId, items) {
  const uid = String(userId || '').trim();
  if (!uid) {
    throw new Error('CHARGE_PROMOTION_IDEMPOTENCY_USER_REQUIRED');
  }
  const parts = (items || [])
    .map((it) => `${String(it.linkedEntityType).trim()}:${String(it.linkedEntityId).trim()}`)
    .filter(Boolean)
    .sort();
  const payload = `${uid}|${parts.join('|')}`;
  const hash = crypto.createHash('sha256').update(payload).digest('hex').slice(0, 32);
  return `charge_promo:${uid}:${hash}`;
}

/**
 * Monta quote promocional a partir de cobranças (formato GET /api/charges).
 * Não persiste no banco.
 *
 * @param {object[]} charges
 * @param {{ discountPercent?: number, minOpenCharges?: number }} [options]
 * @returns {{
 *   eligible: boolean,
 *   discountPercent: number,
 *   originalAmountCents: number,
 *   discountAmountCents: number,
 *   promotionalAmountCents: number,
 *   items: Array<{
 *     publicChargeId: string,
 *     publicChargeType: string,
 *     linkedEntityType: string,
 *     linkedEntityId: string,
 *     originalAmountCents: number,
 *   }>,
 * }|null}
 */
function buildPromotionQuoteFromCharges(charges, options = {}) {
  const discountPercent =
    options.discountPercent != null ? Math.trunc(options.discountPercent) : DEFAULT_DISCOUNT_PERCENT;
  const minOpen =
    options.minOpenCharges != null
      ? Math.trunc(options.minOpenCharges)
      : MIN_OPEN_CHARGES_FOR_PROMOTION;

  if (!Array.isArray(charges) || charges.length === 0) {
    return {
      eligible: false,
      discountPercent,
      originalAmountCents: 0,
      discountAmountCents: 0,
      promotionalAmountCents: 0,
      items: [],
    };
  }

  const seen = new Set();
  const items = [];

  for (const charge of charges) {
    if (!isChargeOpen(charge)) continue;

    const linkage = resolveChargeLinkage(charge);
    if (!linkage) continue;

    const originalAmountCents = amountBrlToCents(charge.amount);
    if (originalAmountCents == null || originalAmountCents <= 0) continue;

    const key = itemDedupeKey(linkage);
    if (seen.has(key)) continue;
    seen.add(key);

    items.push({
      publicChargeId: linkage.publicChargeId,
      publicChargeType: linkage.publicChargeType,
      linkedEntityType: linkage.linkedEntityType,
      linkedEntityId: linkage.linkedEntityId,
      originalAmountCents,
    });
  }

  if (items.length === 0) {
    return {
      eligible: false,
      discountPercent,
      originalAmountCents: 0,
      discountAmountCents: 0,
      promotionalAmountCents: 0,
      items: [],
    };
  }

  const originalAmountCents = items.reduce((sum, it) => sum + it.originalAmountCents, 0);
  const discountAmountCents = calculateDiscountCents(originalAmountCents, discountPercent);
  const promotionalAmountCents = calculatePromotionalAmountCents(
    originalAmountCents,
    discountPercent
  );

  return {
    eligible: items.length >= minOpen && originalAmountCents > 0,
    discountPercent,
    originalAmountCents,
    discountAmountCents,
    promotionalAmountCents,
    items,
  };
}

module.exports = {
  DEFAULT_DISCOUNT_PERCENT,
  MIN_OPEN_CHARGES_FOR_PROMOTION,
  OPEN_CHARGE_STATUSES,
  CLOSED_CHARGE_STATUSES,
  PUBLIC_TO_LINKED_ENTITY_TYPE,
  amountBrlToCents,
  calculateDiscountCents,
  calculatePromotionalAmountCents,
  isChargeOpen,
  resolveChargeLinkage,
  buildPromotionIdempotencyKey,
  buildPromotionQuoteFromCharges,
};
