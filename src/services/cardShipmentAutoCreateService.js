const logger = require('../utils/logger');
const { recordAudit } = require('../utils/auditLog');

/** Deve coincidir com `SHIPPING_FEE_BRL` em `routes/cards.js`. */
const DEFAULT_SHIPPING_FEE_BRL = 39.9;

/** Chave única para remessa criada na aprovação (idempotência e reconciliação). */
function autoShipmentIdempotencyKey(cardId) {
  return `auto-card-shipment:${cardId}`;
}

function sanitizeAddressSnapshot(address) {
  const raw = address && typeof address === 'object' && !Array.isArray(address) ? address : {};
  return {
    cep: String(raw.cep || '').trim(),
    logradouro: String(raw.logradouro || '').trim(),
    numero: String(raw.numero || '').trim(),
    complemento: raw.complemento ? String(raw.complemento).trim() : null,
    bairro: String(raw.bairro || '').trim(),
    cidade: String(raw.cidade || '').trim(),
    estado: String(raw.estado || '').trim().toUpperCase(),
  };
}

function addressSnapshotFromEndereco(endereco) {
  if (!endereco) return sanitizeAddressSnapshot(null);
  return sanitizeAddressSnapshot({
    cep: endereco.cep,
    logradouro: endereco.logradouro,
    numero: endereco.numero,
    complemento: endereco.complemento,
    bairro: endereco.bairro,
    cidade: endereco.cidade,
    estado: endereco.estado,
  });
}

/**
 * Garante registro de frete/envio após aprovação do cartão de crédito.
 * Não debita saldo; `shippingFeeStatus` fica PENDENTE até POST /api/cards/:id/shipment concluir cobrança.
 *
 * @param {object} p
 * @param {import('@prisma/client').PrismaClient} p.prisma
 * @param {string} p.userId
 * @param {string} p.cardId
 * @param {string} [p.cardTipo]
 * @param {{ ip?: string, userAgent?: string }} [p.auditContext]
 * @returns {Promise<{ shipment: object|null, created: boolean, skippedReason?: string }>}
 */
async function ensureCardShipmentOnApproval({ prisma: db, userId, cardId, cardTipo, auditContext }) {
  if (String(cardTipo || '').toLowerCase() !== 'credito') {
    return { shipment: null, created: false, skippedReason: 'not_credit_card' };
  }

  const dedupe = autoShipmentIdempotencyKey(cardId);

  try {
    const existingAny = await db.cardShipment.findFirst({
      where: { cardId, userId },
      orderBy: { createdAt: 'asc' },
    });
    if (existingAny) {
      return { shipment: existingAny, created: false, skippedReason: 'already_exists' };
    }

    const endereco = await db.endereco.findUnique({ where: { userId } });
    const addressSnapshot = addressSnapshotFromEndereco(endereco);
    if (!endereco) {
      logger.warn({ cardId, userId }, 'card_shipment_auto_create_without_endereco');
    }

    const shipment = await db.cardShipment.create({
      data: {
        cardId,
        userId,
        status: 'AGUARDANDO_COBRANCA',
        shippingFeeAmount: DEFAULT_SHIPPING_FEE_BRL,
        shippingFeeStatus: 'PENDENTE',
        idempotencyKeyCharge: dedupe,
        addressSnapshot,
        isSecondIssue: false,
      },
    });

    await db.cardShipmentEvent.create({
      data: {
        shipmentId: shipment.id,
        userId,
        eventType: 'SHIPMENT_CREATED',
        shipmentStatus: 'AGUARDANDO_COBRANCA',
        eventAt: new Date(),
        description: 'Remessa gerada automaticamente na aprovação do cartão',
        createdByType: 'SYSTEM',
      },
    });

    await recordAudit({
      userId,
      action: 'card.shipment.auto_created',
      entity: 'CardShipment',
      entityId: shipment.id,
      metadata: {
        cardId,
        shippingFeeStatus: 'PENDENTE',
        shippingFeeAmount: DEFAULT_SHIPPING_FEE_BRL,
      },
      ip: auditContext?.ip,
      userAgent: auditContext?.userAgent,
    });

    return { shipment, created: true };
  } catch (err) {
    if (err && err.code === 'P2002') {
      const row = await db.cardShipment.findUnique({ where: { idempotencyKeyCharge: dedupe } });
      if (row) {
        return { shipment: row, created: false, skippedReason: 'race_unique' };
      }
    }
    if (err && err.code === 'P2021') {
      logger.warn({ cardId, userId }, 'card_shipment_auto_skip_table_missing');
      return { shipment: null, created: false, skippedReason: 'table_missing' };
    }
    logger.error({ err: err.message, cardId, userId }, 'card_shipment_auto_create_failed');
    throw err;
  }
}

module.exports = {
  ensureCardShipmentOnApproval,
  autoShipmentIdempotencyKey,
  DEFAULT_SHIPPING_FEE_BRL,
};
