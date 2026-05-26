'use strict';

const { prisma } = require('../config/database');
const {
  isChargePromotionsFeatureEnabled,
  MIN_OPEN_CHARGES_FOR_PROMOTION,
} = require('./chargePromotionService');
const pixCobrancaPromotionEfiService = require('./pixCobrancaPromotionEfiService');
const { EfiPixClientError } = pixCobrancaPromotionEfiService;

class PromotionPixError extends Error {
  constructor(code, message, httpStatus = 400) {
    super(message);
    this.name = 'PromotionPixError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

function isChargePromotionPixFeatureEnabled() {
  return (
    String(process.env.FEATURE_CHARGE_PROMOTION_PIX_ENABLED || '')
      .trim()
      .toLowerCase() === 'true'
  );
}

async function isPromotionItemPayable(item, userId) {
  const type = String(item.linkedEntityType || '').trim();
  const entityId = String(item.linkedEntityId || '').trim();
  if (!type || !entityId) return false;

  if (type === 'loan_insurance') {
    const row = await prisma.loanInsuranceCharge.findFirst({
      where: { id: entityId, userId },
    });
    return !!row && row.status === 'pendente';
  }

  if (type === 'card_shipment') {
    const row = await prisma.cardShipment.findFirst({
      where: { id: entityId, userId },
    });
    return !!row && String(row.shippingFeeStatus) === 'PENDENTE';
  }

  if (type === 'boleto') {
    const row = await prisma.boleto.findFirst({
      where: { id: entityId, userId },
    });
    return !!row && ['pendente', 'vencido'].includes(String(row.status));
  }

  return false;
}

async function validatePromotionItemsPayable(promotion, userId) {
  if (!promotion.items || promotion.items.length < MIN_OPEN_CHARGES_FOR_PROMOTION) {
    throw new PromotionPixError(
      'PROMOTION_NOT_PAYABLE',
      'Promoção não possui cobranças elegíveis suficientes.',
      400
    );
  }

  for (const item of promotion.items) {
    // eslint-disable-next-line no-await-in-loop
    const payable = await isPromotionItemPayable(item, userId);
    if (!payable) {
      throw new PromotionPixError(
        'PROMOTION_NOT_PAYABLE',
        'Uma ou mais cobranças da promoção não estão mais pagáveis.',
        400
      );
    }
  }
}

/**
 * Emite ou reutiliza Pix promocional agrupado (sem settlement).
 * @param {{ userId: string, promotionId: string, debtorCpf?: string, debtorName?: string }} params
 */
async function emitOrGetPromotionPix({ userId, promotionId, debtorCpf, debtorName }) {
  if (!isChargePromotionsFeatureEnabled()) {
    throw new PromotionPixError(
      'FEATURE_DISABLED',
      'Promoção de cobranças desabilitada.',
      503
    );
  }

  if (!isChargePromotionPixFeatureEnabled()) {
    throw new PromotionPixError(
      'PROMOTION_PIX_DISABLED',
      'Emissão de Pix promocional desabilitada.',
      503
    );
  }

  if (!pixCobrancaPromotionEfiService.isEfiPixConfigured()) {
    throw new PromotionPixError(
      'PIX_PROVIDER_NOT_CONFIGURED',
      'Provedor Pix não configurado para emissão promocional.',
      503
    );
  }

  const promotion = await prisma.chargePromotion.findFirst({
    where: { id: promotionId, userId },
    include: { items: true },
  });

  if (!promotion) {
    throw new PromotionPixError('PROMOTION_NOT_FOUND', 'Promoção não encontrada.', 404);
  }

  const now = new Date();

  if (promotion.status !== 'ACTIVE') {
    throw new PromotionPixError(
      'PROMOTION_NOT_ACTIVE',
      'Promoção não está ativa.',
      400
    );
  }

  if (promotion.expiresAt <= now) {
    await prisma.chargePromotion.update({
      where: { id: promotion.id },
      data: { status: 'EXPIRED' },
    });
    throw new PromotionPixError('PROMOTION_EXPIRED', 'Promoção expirada.', 410);
  }

  if (promotion.promotionalAmountCents <= 0) {
    throw new PromotionPixError(
      'PROMOTION_NOT_PAYABLE',
      'Valor promocional inválido.',
      400
    );
  }

  await validatePromotionItemsPayable(promotion, userId);

  const paidPix = await pixCobrancaPromotionEfiService.findPaidPixCobrancaForPromotion(
    userId,
    promotionId
  );
  if (paidPix) {
    throw new PromotionPixError(
      'PROMOTION_PIX_ALREADY_PAID',
      'Pix promocional já foi pago; liquidação agrupada pendente.',
      409
    );
  }

  try {
    const pix = await pixCobrancaPromotionEfiService.getOrCreateEfiPixForChargePromotion({
      userId,
      promotionId: promotion.id,
      promotionalAmountCents: promotion.promotionalAmountCents,
      debtorCpf,
      debtorName,
    });

    return {
      pixMode: pix.pixMode,
      pixCopiaECola: pix.pixCopiaECola,
      qrCodePix: pix.qrCodePix,
      amount: pix.amount,
      expiresAt: pix.expiresAt,
      txid: pix.txid,
      provider: pix.provider || 'EFI',
      promotionId: promotion.id,
      providerReference: pix.providerReference || null,
      pixStatus: pix.pixStatus,
      source: pix.source,
    };
  } catch (err) {
    if (err instanceof EfiPixClientError) {
      if (err.code === 'EFI_NOT_CONFIGURED') {
        throw new PromotionPixError(
          'PIX_PROVIDER_NOT_CONFIGURED',
          err.message,
          503
        );
      }
      if (err.promotionPixCode === 'PROMOTION_PIX_ALREADY_PAID' || err.code === 'PROMOTION_PIX_ALREADY_PAID') {
        throw new PromotionPixError(
          'PROMOTION_PIX_ALREADY_PAID',
          err.message,
          409
        );
      }
      throw new PromotionPixError(err.code, err.message, err.httpStatus || 400);
    }
    throw err;
  }
}

module.exports = {
  PromotionPixError,
  isChargePromotionPixFeatureEnabled,
  isPromotionItemPayable,
  emitOrGetPromotionPix,
};
