'use strict';

const crypto = require('crypto');

/**
 * Cálculo e quote de promoção de cobranças (Fatia 1 — puro, sem persistência/Pix).
 *
 * Tipos públicos (GET /api/charges): gru_boleto | loan_insurance | card_shipping
 * Tipos internos (settlement/PixCobranca): boleto | loan_insurance | card_shipment
 */

const { prisma, transaction } = require('../config/database');

const DEFAULT_DISCOUNT_PERCENT = 15;
const MIN_OPEN_CHARGES_FOR_PROMOTION = 2;
const DEFAULT_PROMOTION_TTL_SECONDS = 120;

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

function isChargePromotionsFeatureEnabled() {
  return String(process.env.FEATURE_CHARGE_PROMOTIONS_ENABLED || '')
    .trim()
    .toLowerCase() === 'true';
}

function getChargePromotionTtlSeconds() {
  const raw = process.env.CHARGE_PROMOTION_TTL_SECONDS;
  if (raw == null || String(raw).trim() === '') {
    return DEFAULT_PROMOTION_TTL_SECONDS;
  }
  const n = Math.trunc(Number(raw));
  if (!Number.isFinite(n) || n < 1) {
    return DEFAULT_PROMOTION_TTL_SECONDS;
  }
  return n;
}

/**
 * Início da janela temporal estável (segundos Unix) para idempotência por TTL.
 * @param {Date} [now]
 * @param {number} [ttlSeconds]
 * @returns {number}
 */
function computePromotionWindowStartEpoch(now = new Date(), ttlSeconds = getChargePromotionTtlSeconds()) {
  const sec = Math.floor(now.getTime() / 1000);
  const ttl = Math.max(1, Math.trunc(ttlSeconds));
  return Math.floor(sec / ttl) * ttl;
}

/**
 * Chave idempotente: usuário + conjunto de cobranças + janela temporal.
 * @param {string} userId
 * @param {Array<{ linkedEntityType: string, linkedEntityId: string }>} items
 * @param {number} windowStartEpoch segundos Unix do início da janela
 * @returns {string}
 */
function buildPromotionIdempotencyKey(userId, items, windowStartEpoch) {
  const uid = String(userId || '').trim();
  if (!uid) {
    throw new Error('CHARGE_PROMOTION_IDEMPOTENCY_USER_REQUIRED');
  }
  const window = Math.trunc(windowStartEpoch);
  if (!Number.isFinite(window) || window < 0) {
    throw new Error('CHARGE_PROMOTION_IDEMPOTENCY_WINDOW_INVALID');
  }
  const parts = (items || [])
    .map((it) => `${String(it.linkedEntityType).trim()}:${String(it.linkedEntityId).trim()}`)
    .filter(Boolean)
    .sort();
  const payload = `${uid}|${parts.join('|')}`;
  const hash = crypto.createHash('sha256').update(payload).digest('hex').slice(0, 32);
  return `charge_promo:${uid}:${hash}:${window}`;
}

function formatPromotionForApi(promotion, now = new Date()) {
  const expiresAt = promotion.expiresAt instanceof Date ? promotion.expiresAt : new Date(promotion.expiresAt);
  const expiresInSeconds = Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / 1000));
  return {
    id: promotion.id,
    status: promotion.status,
    discountPercent: promotion.discountPercent,
    originalAmountCents: promotion.originalAmountCents,
    discountAmountCents: promotion.discountAmountCents,
    promotionalAmountCents: promotion.promotionalAmountCents,
    expiresAt: expiresAt.toISOString(),
    expiresInSeconds,
    items: (promotion.items || []).map((it) => ({
      publicChargeId: it.publicChargeId,
      publicChargeType: it.publicChargeType,
      linkedEntityType: it.linkedEntityType,
      linkedEntityId: it.linkedEntityId,
      originalAmountCents: it.originalAmountCents,
    })),
  };
}

async function expireStaleActivePromotionsForUser(userId, now = new Date()) {
  await prisma.chargePromotion.updateMany({
    where: {
      userId,
      status: 'ACTIVE',
      expiresAt: { lte: now },
    },
    data: { status: 'EXPIRED' },
  });
}

/**
 * Cria ou retorna promoção ACTIVE idempotente (sem Pix, sem settlement).
 * @param {string} userId
 * @param {object[]} openChargeSummaries — saída de listOpenChargeSummariesForUser
 * @param {{ now?: Date, ttlSeconds?: number, discountPercent?: number }} [options]
 * @returns {Promise<{ promotion: object|null }>}
 */
async function getOrCreateCurrentChargePromotion(userId, openChargeSummaries, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const ttlSeconds = options.ttlSeconds != null ? Math.trunc(options.ttlSeconds) : getChargePromotionTtlSeconds();
  const quote = buildPromotionQuoteFromCharges(openChargeSummaries, {
    discountPercent: options.discountPercent,
  });

  if (!quote.eligible) {
    return { promotion: null };
  }

  await expireStaleActivePromotionsForUser(userId, now);

  let windowStartEpoch = computePromotionWindowStartEpoch(now, ttlSeconds);
  let idempotencyKey = buildPromotionIdempotencyKey(userId, quote.items, windowStartEpoch);

  const findByKey = async (key) =>
    prisma.chargePromotion.findUnique({
      where: { idempotencyKey: key },
      include: { items: true },
    });

  let existing = await findByKey(idempotencyKey);

  if (existing) {
    if (existing.status === 'ACTIVE' && existing.expiresAt > now) {
      return { promotion: formatPromotionForApi(existing, now) };
    }
    if (existing.status === 'ACTIVE' && existing.expiresAt <= now) {
      await prisma.chargePromotion.update({
        where: { id: existing.id },
        data: { status: 'EXPIRED' },
      });
      windowStartEpoch = Math.floor(now.getTime() / 1000);
      idempotencyKey = buildPromotionIdempotencyKey(userId, quote.items, windowStartEpoch);
      existing = await findByKey(idempotencyKey);
    } else if (existing.status === 'EXPIRED' || existing.status === 'PAID' || existing.status === 'CANCELLED') {
      windowStartEpoch = Math.floor(now.getTime() / 1000);
      idempotencyKey = buildPromotionIdempotencyKey(userId, quote.items, windowStartEpoch);
      existing = await findByKey(idempotencyKey);
    }
  }

  if (existing && existing.status === 'ACTIVE' && existing.expiresAt > now) {
    return { promotion: formatPromotionForApi(existing, now) };
  }

  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

  const createPayload = {
    userId,
    idempotencyKey,
    status: 'ACTIVE',
    discountPercent: quote.discountPercent,
    originalAmountCents: quote.originalAmountCents,
    discountAmountCents: quote.discountAmountCents,
    promotionalAmountCents: quote.promotionalAmountCents,
    expiresAt,
    items: {
      create: quote.items.map((it) => ({
        publicChargeId: it.publicChargeId,
        publicChargeType: it.publicChargeType,
        linkedEntityType: it.linkedEntityType,
        linkedEntityId: it.linkedEntityId,
        originalAmountCents: it.originalAmountCents,
      })),
    },
  };

  try {
    const created = await transaction(async (tx) => {
      const row = await tx.chargePromotion.create({
        data: createPayload,
        include: { items: true },
      });
      return row;
    });
    return { promotion: formatPromotionForApi(created, now) };
  } catch (err) {
    if (err && err.code === 'P2002') {
      const raced = await findByKey(idempotencyKey);
      if (raced) {
        if (raced.status === 'ACTIVE' && raced.expiresAt > now) {
          return { promotion: formatPromotionForApi(raced, now) };
        }
        if (raced.status === 'ACTIVE' && raced.expiresAt <= now) {
          await prisma.chargePromotion.update({
            where: { id: raced.id },
            data: { status: 'EXPIRED' },
          });
        }
      }
      const retryWindow = Math.floor(now.getTime() / 1000);
      const retryKey = buildPromotionIdempotencyKey(userId, quote.items, retryWindow);
      const retryExisting = await findByKey(retryKey);
      if (retryExisting && retryExisting.status === 'ACTIVE' && retryExisting.expiresAt > now) {
        return { promotion: formatPromotionForApi(retryExisting, now) };
      }
      if (retryKey !== idempotencyKey) {
        try {
          const createdRetry = await transaction(async (tx) =>
            tx.chargePromotion.create({
              data: { ...createPayload, idempotencyKey: retryKey },
              include: { items: true },
            })
          );
          return { promotion: formatPromotionForApi(createdRetry, now) };
        } catch (retryErr) {
          if (retryErr && retryErr.code === 'P2002') {
            const racedRetry = await findByKey(retryKey);
            if (racedRetry && racedRetry.status === 'ACTIVE' && racedRetry.expiresAt > now) {
              return { promotion: formatPromotionForApi(racedRetry, now) };
            }
          }
          throw retryErr;
        }
      }
    }
    throw err;
  }
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
  DEFAULT_PROMOTION_TTL_SECONDS,
  OPEN_CHARGE_STATUSES,
  CLOSED_CHARGE_STATUSES,
  PUBLIC_TO_LINKED_ENTITY_TYPE,
  isChargePromotionsFeatureEnabled,
  getChargePromotionTtlSeconds,
  computePromotionWindowStartEpoch,
  amountBrlToCents,
  calculateDiscountCents,
  calculatePromotionalAmountCents,
  isChargeOpen,
  resolveChargeLinkage,
  buildPromotionIdempotencyKey,
  buildPromotionQuoteFromCharges,
  formatPromotionForApi,
  expireStaleActivePromotionsForUser,
  getOrCreateCurrentChargePromotion,
};
