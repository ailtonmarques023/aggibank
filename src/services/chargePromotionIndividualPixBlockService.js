'use strict';

const { prisma } = require('../config/database');
const { LINKED_ENTITY_TYPE_CHARGE_PROMOTION } = require('./pixCobrancaPromotionEfiService');

/** Pix promocional emitido e ainda cobrável (não expirado). */
const PROMOTION_PIX_ACTIVE_STATUSES = ['CRIADA', 'ATIVA'];

/** Pix promocional pago ou conciliado — bloqueia Pix individual. */
const PROMOTION_PIX_PAID_STATUSES = ['PAGA', 'CONCILIADA', 'LIQUIDADA'];

/** Promoções que podem conter trava com Pix promocional relevante. */
const BLOCKING_PROMOTION_STATUSES = ['ACTIVE', 'EXPIRED'];

function isBlockIndividualPixWhenPromotionActiveEnabled() {
  return (
    String(process.env.FEATURE_BLOCK_INDIVIDUAL_PIX_WHEN_PROMOTION_ACTIVE || '')
      .trim()
      .toLowerCase() === 'true'
  );
}

/**
 * @param {object} pix — linha PixCobranca
 * @param {Date} now
 * @returns {{ blocking: boolean, reason?: string }}
 */
function evaluatePromotionalPixBlocking(pix, now) {
  const status = String(pix.status || '').trim().toUpperCase();
  if (PROMOTION_PIX_PAID_STATUSES.includes(status)) {
    return { blocking: true, reason: 'PROMOTION_PIX_PAID' };
  }
  if (PROMOTION_PIX_ACTIVE_STATUSES.includes(status)) {
    const exp = pix.expiresAt ? new Date(pix.expiresAt) : null;
    if (!exp || exp > now) {
      return { blocking: true, reason: 'PROMOTION_PIX_ACTIVE' };
    }
  }
  return { blocking: false };
}

/**
 * Verifica se a cobrança individual deve ser bloqueada por Pix promocional agrupado relevante.
 *
 * Não bloqueia apenas por existir ChargePromotion ACTIVE sem Pix promocional emitido.
 *
 * @param {{
 *   userId: string,
 *   publicChargeId: string,
 *   publicChargeType: string,
 *   linkedEntityType: string,
 *   linkedEntityId: string,
 *   now?: Date,
 * }} params
 * @returns {Promise<{
 *   blocked: boolean,
 *   reason?: string,
 *   promotionId?: string,
 *   pixCobrancaId?: string,
 *   pixStatus?: string,
 *   expiresAt?: Date|null,
 * }>}
 */
async function findBlockingPromotionForIndividualPix({
  userId,
  publicChargeId,
  publicChargeType,
  linkedEntityType,
  linkedEntityId,
  now = new Date(),
}) {
  if (!isBlockIndividualPixWhenPromotionActiveEnabled()) {
    return { blocked: false };
  }

  const uid = String(userId || '').trim();
  const entityType = String(linkedEntityType || '').trim();
  const eid = String(linkedEntityId || '').trim();
  if (!uid || !entityType || !eid) {
    return { blocked: false };
  }

  const candidateItems = await prisma.chargePromotionItem.findMany({
    where: {
      linkedEntityType: entityType,
      linkedEntityId: eid,
      promotion: {
        userId: uid,
        status: { in: BLOCKING_PROMOTION_STATUSES },
      },
    },
    include: {
      promotion: {
        select: {
          id: true,
          status: true,
          expiresAt: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!candidateItems.length) {
    return { blocked: false };
  }

  for (const item of candidateItems) {
    if (!item.promotion) {
      // eslint-disable-next-line no-continue
      continue;
    }

    const promotion = item.promotion;
    // eslint-disable-next-line no-await-in-loop
    const pixList = await prisma.pixCobranca.findMany({
      where: {
        userId: uid,
        linkedEntityType: LINKED_ENTITY_TYPE_CHARGE_PROMOTION,
        linkedEntityId: promotion.id,
      },
      orderBy: { createdAt: 'desc' },
    });

    for (const pix of pixList) {
      const verdict = evaluatePromotionalPixBlocking(pix, now);
      if (verdict.blocking) {
        return {
          blocked: true,
          reason: verdict.reason,
          promotionId: promotion.id,
          pixCobrancaId: pix.id,
          pixStatus: pix.status,
          expiresAt: pix.expiresAt || null,
          publicChargeId: String(publicChargeId || '').trim() || undefined,
          publicChargeType: String(publicChargeType || '').trim() || undefined,
        };
      }
    }
  }

  return { blocked: false };
}

/**
 * Mapeia resultado de parseChargeParam para tipos públicos/internos.
 * @param {string} publicChargeId — req.params.id (ex.: lic_charge-lic-1)
 * @param {{ kind: string, id: string }} parsed
 */
function linkageFromParsedCharge(publicChargeId, parsed) {
  const publicChargeType =
    parsed.kind === 'boleto'
      ? 'gru_boleto'
      : parsed.kind === 'loan_insurance'
        ? 'loan_insurance'
        : 'card_shipping';

  return {
    publicChargeId: String(publicChargeId || '').trim(),
    publicChargeType,
    linkedEntityType: parsed.kind,
    linkedEntityId: parsed.id,
  };
}

module.exports = {
  PROMOTION_PIX_ACTIVE_STATUSES,
  PROMOTION_PIX_PAID_STATUSES,
  BLOCKING_PROMOTION_STATUSES,
  isBlockIndividualPixWhenPromotionActiveEnabled,
  evaluatePromotionalPixBlocking,
  findBlockingPromotionForIndividualPix,
  linkageFromParsedCharge,
};
