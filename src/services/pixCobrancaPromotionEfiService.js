'use strict';

const { prisma } = require('../config/database');
const logger = require('../utils/logger');
const efiPixClient = require('./efiPixClient');
const { PIX_PROVIDER_ID } = require('./pix/pixProviderTypes');
const {
  findActivePixCobranca,
  mapRowToPixResponse,
  EfiPixClientError,
} = require('./pixCobrancaEfiService');

const LINKED_ENTITY_TYPE_CHARGE_PROMOTION = 'charge_promotion';
const ACTIVE_PIX_STATUSES = ['CRIADA', 'ATIVA'];
const PAID_PIX_STATUSES = ['PAGA', 'CONCILIADA'];

function promotionalCentsToBrl(promotionalAmountCents) {
  const cents = Math.trunc(promotionalAmountCents);
  return Number((cents / 100).toFixed(2));
}

async function findPaidPixCobrancaForPromotion(userId, promotionId) {
  return prisma.pixCobranca.findFirst({
    where: {
      userId,
      linkedEntityType: LINKED_ENTITY_TYPE_CHARGE_PROMOTION,
      linkedEntityId: promotionId,
      status: { in: PAID_PIX_STATUSES },
    },
    orderBy: { paidAt: 'desc' },
  });
}

/**
 * Obtém ou cria Pix Efí para ChargePromotion (sem settlement).
 */
async function getOrCreateEfiPixForChargePromotion({
  userId,
  promotionId,
  promotionalAmountCents,
  debtorCpf,
  debtorName,
}) {
  const amount = promotionalCentsToBrl(promotionalAmountCents);

  if (!efiPixClient.isEfiPixConfigured()) {
    throw new EfiPixClientError('EFI_NOT_CONFIGURED', 'Integração Efí Pix não configurada', 503);
  }

  const paid = await findPaidPixCobrancaForPromotion(userId, promotionId);
  if (paid) {
    const err = new EfiPixClientError(
      'PROMOTION_PIX_ALREADY_PAID',
      'Pix promocional já foi pago; liquidação agrupada pendente de implementação.',
      409
    );
    err.promotionPixCode = 'PROMOTION_PIX_ALREADY_PAID';
    throw err;
  }

  const existing = await findActivePixCobranca(
    userId,
    LINKED_ENTITY_TYPE_CHARGE_PROMOTION,
    promotionId
  );
  if (existing) {
    return { ...mapRowToPixResponse(existing), promotionId };
  }

  const txid = efiPixClient.generateTxid();
  const idempotencyKey = `efi_emit:charge_promotion:${promotionId}:${txid}`;

  const efiResult = await efiPixClient.createImmediateCob({
    txid,
    amount,
    debtorCpf,
    debtorName,
  });

  if (!efiResult.pixCopiaECola) {
    logger.warn('efi_pix_promotion_cob_sem_br_code', {
      category: 'operational_error',
      component: 'pixCobrancaPromotionEfiService',
      txid: efiResult.txid,
      promotionId,
    });
  }

  const row = await prisma.pixCobranca.create({
    data: {
      userId,
      linkedEntityType: LINKED_ENTITY_TYPE_CHARGE_PROMOTION,
      linkedEntityId: promotionId,
      amount,
      provider: PIX_PROVIDER_ID.EFI,
      status: efiResult.status || 'ATIVA',
      txid: efiResult.txid,
      providerReference: efiResult.providerReference,
      pixCopiaECola: efiResult.pixCopiaECola,
      qrCodePix: efiResult.qrCodePix,
      expiresAt: efiResult.expiresAt,
      paidAt: null,
      idempotencyKey,
      rawProviderPayload: efiResult.raw || undefined,
    },
  });

  return { ...mapRowToPixResponse(row), promotionId };
}

module.exports = {
  LINKED_ENTITY_TYPE_CHARGE_PROMOTION,
  PAID_PIX_STATUSES,
  promotionalCentsToBrl,
  findPaidPixCobrancaForPromotion,
  getOrCreateEfiPixForChargePromotion,
  isEfiPixConfigured: () => efiPixClient.isEfiPixConfigured(),
  EfiPixClientError,
};
