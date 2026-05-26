'use strict';

const logger = require('../utils/logger');
const { recordAudit } = require('../utils/auditLog');
const {
  registrarCreditoLiberadoDeBloqueado,
  registrarCreditoSaldoAtual,
  LedgerError,
} = require('./ledgerService');
const {
  amountBrlToCents,
  isChargePromotionSettlementEnabled,
  MIN_OPEN_CHARGES_FOR_PROMOTION,
} = require('./chargePromotionService');
const {
  notifyLoanInsuranceSettled,
  notifyBoletoPago,
  notifyCardShipmentFreightPixSettled,
  notifyAccountDepositPixCredited,
} = require('./inAppNotificationService');

function moneyCents(n) {
  const x = Number(String(n).replace(',', '.'));
  if (!Number.isFinite(x)) return null;
  return Math.round(x * 100);
}

function amountsMatch(a, b) {
  const ca = moneyCents(a);
  const cb = moneyCents(b);
  if (ca == null || cb == null) return false;
  return ca === cb;
}

function releaseIdempotencyKey(pixCobrancaId) {
  return `loan_insurance_release_pix:${pixCobrancaId}`;
}

function depositCreditIdempotencyKey(pixCobrancaId) {
  return `pix_deposit_credit:${pixCobrancaId}`;
}

function loanInsurancePromoReleaseKey(promotionId, chargeId) {
  return `loan_insurance_release_promo:${promotionId}:${chargeId}`;
}

function promotionAuditItems(items) {
  return (items || []).map((item) => ({
    linkedEntityType: item.linkedEntityType,
    linkedEntityId: item.linkedEntityId,
    publicChargeId: item.publicChargeId,
    originalAmountCents: item.originalAmountCents,
  }));
}

function promotionAuditMetadata(promotion, pixCobranca, extra = {}) {
  return {
    promotionId: promotion.id,
    pixCobrancaId: pixCobranca.id,
    originalAmountCents: promotion.originalAmountCents,
    discountAmountCents: promotion.discountAmountCents,
    promotionalAmountCents: promotion.promotionalAmountCents,
    itemCount: promotion.items?.length ?? 0,
    items: promotionAuditItems(promotion.items),
    ...extra,
  };
}

/**
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 * @param {object} item
 * @param {string} userId
 * @returns {Promise<{ ok: true } | { ok: false, code: 'ALREADY_PAID' | 'NOT_PAYABLE' | 'NOT_FOUND' }>}
 */
async function checkPromotionItemPayable(tx, item, userId) {
  const type = String(item.linkedEntityType || '').trim();
  const entityId = String(item.linkedEntityId || '').trim();
  if (!type || !entityId) {
    return { ok: false, code: 'NOT_PAYABLE' };
  }

  if (type === 'loan_insurance') {
    const charge = await tx.loanInsuranceCharge.findFirst({
      where: { id: entityId, userId },
    });
    if (!charge) return { ok: false, code: 'NOT_FOUND' };
    if (charge.status === 'pago') return { ok: false, code: 'ALREADY_PAID' };
    if (charge.status !== 'pendente') return { ok: false, code: 'NOT_PAYABLE' };
    const loan = await tx.emprestimo.findUnique({
      where: { id: charge.loanId },
      select: {
        userId: true,
        status: true,
        insuranceSelected: true,
        insuranceChargeStatus: true,
      },
    });
    if (
      !loan ||
      loan.userId !== userId ||
      loan.status !== 'aprovado' ||
      !loan.insuranceSelected ||
      loan.insuranceChargeStatus !== 'pendente'
    ) {
      return { ok: false, code: 'NOT_PAYABLE' };
    }
    return { ok: true };
  }

  if (type === 'card_shipment') {
    const shipment = await tx.cardShipment.findFirst({
      where: { id: entityId, userId },
    });
    if (!shipment) return { ok: false, code: 'NOT_FOUND' };
    if (String(shipment.shippingFeeStatus) === 'DEBITADO') {
      return { ok: false, code: 'ALREADY_PAID' };
    }
    if (String(shipment.shippingFeeStatus) !== 'PENDENTE') {
      return { ok: false, code: 'NOT_PAYABLE' };
    }
    if (String(shipment.status) !== 'AGUARDANDO_COBRANCA') {
      return { ok: false, code: 'NOT_PAYABLE' };
    }
    return { ok: true };
  }

  if (type === 'boleto') {
    const boleto = await tx.boleto.findFirst({
      where: { id: entityId, userId },
    });
    if (!boleto) return { ok: false, code: 'NOT_FOUND' };
    if (String(boleto.status) === 'pago') return { ok: false, code: 'ALREADY_PAID' };
    if (!['pendente', 'vencido'].includes(String(boleto.status))) {
      return { ok: false, code: 'NOT_PAYABLE' };
    }
    return { ok: true };
  }

  return { ok: false, code: 'NOT_PAYABLE' };
}

async function settleLoanInsurancePromotionItemInTx(tx, ctx) {
  const { item, userId, promotionId, paidAt, pixCobranca, requestId, ip } = ctx;
  const chargeId = String(item.linkedEntityId);
  const releaseKey = loanInsurancePromoReleaseKey(promotionId, chargeId);

  const existingMov = await tx.movimentacao.findUnique({
    where: { idempotencyKey: releaseKey },
    select: { id: true },
  });
  if (existingMov) {
    const chargeCheck = await tx.loanInsuranceCharge.findFirst({
      where: { id: chargeId, userId },
      select: { status: true },
    });
    if (chargeCheck && chargeCheck.status === 'pago') {
      return;
    }
  }

  const charge = await tx.loanInsuranceCharge.findFirst({
    where: { id: chargeId, userId },
  });
  if (!charge || charge.status !== 'pendente') {
    throw new Error('PROMOTION_LOAN_INSURANCE_SETTLE_FAILED');
  }

  const loan = await tx.emprestimo.findUnique({
    where: { id: charge.loanId },
    select: {
      id: true,
      userId: true,
      status: true,
      insuranceSelected: true,
      insuranceChargeStatus: true,
      valorAprovado: true,
    },
  });
  if (
    !loan ||
    loan.userId !== userId ||
    loan.status !== 'aprovado' ||
    !loan.insuranceSelected ||
    loan.insuranceChargeStatus !== 'pendente'
  ) {
    throw new Error('PROMOTION_LOAN_INSURANCE_INVALID_LOAN');
  }

  const principal = Number(loan.valorAprovado);
  if (!Number.isFinite(principal) || principal <= 0) {
    throw new Error('PROMOTION_LOAN_INSURANCE_INVALID_PRINCIPAL');
  }

  const updCharge = await tx.loanInsuranceCharge.updateMany({
    where: { id: charge.id, userId, status: 'pendente' },
    data: { status: 'pago', paidAt },
  });
  if (updCharge.count !== 1) {
    throw new Error('PROMOTION_LOAN_INSURANCE_CHARGE_RACE');
  }

  if (!existingMov) {
    try {
      await registrarCreditoLiberadoDeBloqueado(tx, {
        userId,
        valorLiberado: principal,
        tipo: 'credito',
        descricao: 'Liberação do crédito do empréstimo após seguro (Pix promocional)',
        categoria: 'emprestimo_desbloqueio',
        referenceType: 'emprestimo',
        referenceId: loan.id,
        idempotencyKey: releaseKey,
      });
    } catch (e) {
      if (e instanceof LedgerError) {
        await recordAudit({
          userId,
          action: 'pix.settlement.charge_promotion.item_failed',
          entity: 'PixCobranca',
          entityId: pixCobranca.id,
          metadata: {
            linkedEntityType: 'loan_insurance',
            linkedEntityId: chargeId,
            promotionId,
            ledgerCode: e.code,
            requestId: requestId || null,
          },
          ip: ip || null,
          userAgent: null,
        });
      }
      throw e;
    }
  }

  await tx.emprestimo.update({
    where: { id: loan.id },
    data: {
      fundsStatus: 'disponivel',
      insuranceChargeStatus: 'pago',
    },
  });
}

async function settleCardShipmentPromotionItemInTx(tx, ctx) {
  const { item, userId, paidAt, pixCobranca, promotionId, requestId, ip, settledShipmentIds } =
    ctx;
  const shipmentId = String(item.linkedEntityId);

  if (settledShipmentIds && settledShipmentIds.has(shipmentId)) {
    return;
  }

  const shipment = await tx.cardShipment.findFirst({
    where: { id: shipmentId, userId },
  });
  if (!shipment) {
    throw new Error('PROMOTION_CARD_SHIPMENT_SETTLE_FAILED');
  }
  if (
    String(shipment.shippingFeeStatus) === 'DEBITADO' &&
    String(shipment.status) === 'COBRANCA_CONFIRMADA'
  ) {
    if (settledShipmentIds) {
      settledShipmentIds.add(shipmentId);
    }
    return;
  }
  if (
    String(shipment.shippingFeeStatus) !== 'PENDENTE' ||
    String(shipment.status) !== 'AGUARDANDO_COBRANCA'
  ) {
    throw new Error('PROMOTION_CARD_SHIPMENT_SETTLE_FAILED');
  }

  const upd = await tx.cardShipment.updateMany({
    where: {
      id: shipmentId,
      userId,
      shippingFeeStatus: 'PENDENTE',
      status: 'AGUARDANDO_COBRANCA',
    },
    data: {
      status: 'COBRANCA_CONFIRMADA',
      shippingFeeStatus: 'DEBITADO',
      shippingFeeMovementId: null,
    },
  });
  if (upd.count !== 1) {
    throw new Error('PROMOTION_CARD_SHIPMENT_RACE');
  }

  await tx.cardShipmentEvent.create({
    data: {
      shipmentId,
      userId,
      eventType: 'FRETE_COBRADO',
      shipmentStatus: 'COBRANCA_CONFIRMADA',
      eventAt: paidAt,
      description: 'Frete pago via Pix promocional (sem débito em saldoAtual)',
      createdByType: 'SYSTEM',
    },
  });

  if (settledShipmentIds) {
    settledShipmentIds.add(shipmentId);
  }

  await recordAudit({
    userId,
    action: 'pix.settlement.charge_promotion.item_settled',
    entity: 'PixCobranca',
    entityId: pixCobranca.id,
    metadata: {
      promotionId,
      linkedEntityType: 'card_shipment',
      linkedEntityId: shipmentId,
      requestId: requestId || null,
    },
    ip: ip || null,
    userAgent: null,
  });
}

async function settleBoletoPromotionItemInTx(tx, ctx) {
  const { item, userId, paidAt, pixCobranca, promotionId, requestId, ip } = ctx;
  const boletoId = String(item.linkedEntityId);

  const upd = await tx.boleto.updateMany({
    where: { id: boletoId, userId, status: { in: ['pendente', 'vencido'] } },
    data: { status: 'pago', dataPagamento: paidAt },
  });
  if (upd.count !== 1) {
    throw new Error('PROMOTION_BOLETO_SETTLE_FAILED');
  }

  const boleto = await tx.boleto.findFirst({
    where: { id: boletoId, userId },
  });
  if (!boleto) {
    throw new Error('PROMOTION_BOLETO_NOT_FOUND');
  }

  if (boleto.solicitacaoTipo === 'CARD_SHIPMENT' && boleto.solicitacaoId) {
    await settleCardShipmentPromotionItemInTx(tx, {
      item: {
        linkedEntityType: 'card_shipment',
        linkedEntityId: boleto.solicitacaoId,
      },
      userId,
      paidAt,
      pixCobranca,
      promotionId,
      requestId,
      ip,
      settledShipmentIds: ctx.settledShipmentIds,
    });
  }

  await recordAudit({
    userId,
    action: 'pix.settlement.charge_promotion.item_settled',
    entity: 'PixCobranca',
    entityId: pixCobranca.id,
    metadata: {
      promotionId,
      linkedEntityType: 'boleto',
      linkedEntityId: boletoId,
      requestId: requestId || null,
    },
    ip: ip || null,
    userAgent: null,
  });
}

async function settlePromotionItemInTx(tx, ctx) {
  const type = String(ctx.item.linkedEntityType || '').trim();
  if (type === 'loan_insurance') {
    await settleLoanInsurancePromotionItemInTx(tx, ctx);
    return;
  }
  if (type === 'card_shipment') {
    await settleCardShipmentPromotionItemInTx(tx, ctx);
    return;
  }
  if (type === 'boleto') {
    await settleBoletoPromotionItemInTx(tx, ctx);
    return;
  }
  const err = new Error('UNSUPPORTED_PROMOTION_ITEM');
  err.code = 'UNSUPPORTED_PROMOTION_ITEM';
  throw err;
}

/**
 * Settlement agrupado atômico da promoção de cobranças (Fatia 4).
 *
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 * @param {object} opts
 * @returns {Promise<{ settlementResult: string, postCommit?: null }>}
 */
async function settleChargePromotionInTx(tx, { pixCobranca, webhookEventId, requestId, ip }) {
  if (!pixCobranca || pixCobranca.status !== 'PAGA') {
    return { settlementResult: 'INVALID_STATE' };
  }
  if (String(pixCobranca.linkedEntityType || '').trim() !== 'charge_promotion') {
    return { settlementResult: 'INVALID_STATE' };
  }

  const promotionId = String(pixCobranca.linkedEntityId || '').trim();
  const userId = pixCobranca.userId;
  if (!promotionId || !userId) {
    return { settlementResult: 'INVALID_STATE' };
  }

  const promotion = await tx.chargePromotion.findFirst({
    where: { id: promotionId },
    include: { items: true },
  });

  if (!promotion) {
    return { settlementResult: 'INVALID_STATE' };
  }
  if (promotion.userId !== userId) {
    return { settlementResult: 'INVALID_STATE' };
  }

  if (promotion.status === 'PAID') {
    await recordAudit({
      userId,
      action: 'pix.settlement.charge_promotion.already_settled',
      entity: 'PixCobranca',
      entityId: pixCobranca.id,
      metadata: promotionAuditMetadata(promotion, pixCobranca, {
        webhookEventId: webhookEventId || null,
        requestId: requestId || null,
        settlementResult: 'ALREADY_SETTLED',
      }),
      ip: ip || null,
      userAgent: null,
    });
    return { settlementResult: 'ALREADY_SETTLED' };
  }

  if (promotion.status === 'CANCELLED') {
    return { settlementResult: 'INVALID_STATE' };
  }

  if (!['ACTIVE', 'EXPIRED'].includes(String(promotion.status))) {
    return { settlementResult: 'INVALID_STATE' };
  }

  const pixAmountCents = amountBrlToCents(pixCobranca.amount);
  if (
    pixAmountCents == null ||
    pixAmountCents !== Math.trunc(promotion.promotionalAmountCents)
  ) {
    await recordAudit({
      userId,
      action: 'pix.settlement.charge_promotion.item_failed',
      entity: 'PixCobranca',
      entityId: pixCobranca.id,
      metadata: promotionAuditMetadata(promotion, pixCobranca, {
        webhookEventId: webhookEventId || null,
        requestId: requestId || null,
        settlementResult: 'AMOUNT_MISMATCH',
        pixAmountCents,
      }),
      ip: ip || null,
      userAgent: null,
    });
    return { settlementResult: 'AMOUNT_MISMATCH' };
  }

  const items = promotion.items || [];
  if (items.length < MIN_OPEN_CHARGES_FOR_PROMOTION) {
    return { settlementResult: 'INVALID_STATE' };
  }

  for (const item of items) {
    const type = String(item.linkedEntityType || '').trim();
    if (!['loan_insurance', 'card_shipment', 'boleto'].includes(type)) {
      await recordAudit({
        userId,
        action: 'pix.settlement.charge_promotion.item_failed',
        entity: 'PixCobranca',
        entityId: pixCobranca.id,
        metadata: promotionAuditMetadata(promotion, pixCobranca, {
          webhookEventId: webhookEventId || null,
          requestId: requestId || null,
          settlementResult: 'UNSUPPORTED_PROMOTION_ITEM',
          failedItem: {
            linkedEntityType: item.linkedEntityType,
            linkedEntityId: item.linkedEntityId,
          },
        }),
        ip: ip || null,
        userAgent: null,
      });
      return { settlementResult: 'UNSUPPORTED_PROMOTION_ITEM' };
    }

    // eslint-disable-next-line no-await-in-loop
    const payable = await checkPromotionItemPayable(tx, item, userId);
    if (!payable.ok) {
      const settlementResult =
        payable.code === 'ALREADY_PAID'
          ? 'PROMOTION_SETTLEMENT_BLOCKED_ITEM_ALREADY_PAID'
          : 'INVALID_STATE';

      await recordAudit({
        userId,
        action: 'pix.settlement.charge_promotion.item_failed',
        entity: 'PixCobranca',
        entityId: pixCobranca.id,
        metadata: promotionAuditMetadata(promotion, pixCobranca, {
          webhookEventId: webhookEventId || null,
          requestId: requestId || null,
          settlementResult,
          failedItem: {
            linkedEntityType: item.linkedEntityType,
            linkedEntityId: item.linkedEntityId,
            payableCode: payable.code,
          },
        }),
        ip: ip || null,
        userAgent: null,
      });
      return { settlementResult };
    }
  }

  const paidAt = pixCobranca.paidAt || new Date();

  await recordAudit({
    userId,
    action: 'pix.settlement.charge_promotion.start',
    entity: 'PixCobranca',
    entityId: pixCobranca.id,
    metadata: promotionAuditMetadata(promotion, pixCobranca, {
      webhookEventId: webhookEventId || null,
      requestId: requestId || null,
    }),
    ip: ip || null,
    userAgent: null,
  });

  const settledShipmentIds = new Set();
  const itemCtx = {
    userId,
    promotionId,
    paidAt,
    pixCobranca,
    requestId,
    ip,
    settledShipmentIds,
  };

  for (const item of items) {
    // eslint-disable-next-line no-await-in-loop
    await settlePromotionItemInTx(tx, { ...itemCtx, item });
  }

  const markPaid = await tx.chargePromotion.updateMany({
    where: {
      id: promotionId,
      userId,
      status: { in: ['ACTIVE', 'EXPIRED'] },
    },
    data: {
      status: 'PAID',
      paidAt,
    },
  });
  if (markPaid.count !== 1) {
    const again = await tx.chargePromotion.findFirst({
      where: { id: promotionId, userId },
      select: { status: true },
    });
    if (again && again.status === 'PAID') {
      return { settlementResult: 'ALREADY_SETTLED' };
    }
    throw new Error('PROMOTION_MARK_PAID_FAILED');
  }

  await recordAudit({
    userId,
    action: 'pix.settlement.charge_promotion.settled',
    entity: 'PixCobranca',
    entityId: pixCobranca.id,
    metadata: promotionAuditMetadata(promotion, pixCobranca, {
      webhookEventId: webhookEventId || null,
      requestId: requestId || null,
      settlementResult: 'SETTLED',
    }),
    ip: ip || null,
    userAgent: null,
  });

  return { settlementResult: 'SETTLED', postCommit: null };
}

/**
 * Settlement de negócio após PixCobranca confirmada como PAGA (mesma transação do webhook).
 * Não debita saldoAtual por taxas pagas via Pix externo. Idempotente por entidade + chaves de ledger.
 *
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 * @param {object} opts
 * @param {object} opts.pixCobranca — linha PixCobranca já com status PAGA
 * @param {string} [opts.webhookEventId]
 * @param {string|null} [opts.requestId]
 * @param {string|null} [opts.ip]
 * @returns {Promise<{ settlementResult: string, postCommit?: () => Promise<void> }>}
 */
async function settlePaidPixCobrancaInTx(tx, { pixCobranca, webhookEventId, requestId, ip }) {
  if (!pixCobranca || pixCobranca.status !== 'PAGA') {
    return { settlementResult: 'INVALID_STATE' };
  }

  const type = String(pixCobranca.linkedEntityType || '').trim();
  if (type === 'charge_promotion') {
    if (!isChargePromotionSettlementEnabled()) {
      await recordAudit({
        userId: pixCobranca.userId,
        action: 'pix.settlement.charge_promotion_deferred',
        entity: 'PixCobranca',
        entityId: pixCobranca.id,
        metadata: {
          linkedEntityId: pixCobranca.linkedEntityId,
          webhookEventId: webhookEventId || null,
          requestId: requestId || null,
          message:
            'Charge promotion Pix paid; grouped settlement disabled (FEATURE_CHARGE_PROMOTION_SETTLEMENT_ENABLED).',
        },
        ip: ip || null,
        userAgent: null,
      });
      return { settlementResult: 'PROMOTION_SETTLEMENT_PENDING' };
    }
    return settleChargePromotionInTx(tx, {
      pixCobranca,
      webhookEventId,
      requestId,
      ip,
    });
  }
  const entityId = String(pixCobranca.linkedEntityId || '').trim();
  const userId = pixCobranca.userId;
  const cobAmount = pixCobranca.amount;

  if (!type || !entityId || !userId) {
    return { settlementResult: 'INVALID_STATE' };
  }

  try {
    if (type === 'loan_insurance') {
      return await settleLoanInsuranceInTx(tx, {
        pixCobranca,
        chargeId: entityId,
        userId,
        cobAmount,
        webhookEventId,
        requestId,
        ip,
      });
    }
    if (type === 'card_shipment') {
      return await settleCardShipmentFreightInTx(tx, {
        pixCobranca,
        shipmentId: entityId,
        userId,
        cobAmount,
        webhookEventId,
        requestId,
        ip,
      });
    }
    if (type === 'boleto') {
      return await settleBoletoInTx(tx, {
        pixCobranca,
        boletoId: entityId,
        userId,
        cobAmount,
        webhookEventId,
        requestId,
        ip,
      });
    }
    if (type === 'account_deposit') {
      return await settleAccountDepositInTx(tx, {
        pixCobranca,
        depositId: entityId,
        userId,
        cobAmount,
        webhookEventId,
        requestId,
        ip,
      });
    }
  } catch (e) {
    if (e instanceof LedgerError) {
      throw e;
    }
    logger.error('pix_settlement_unexpected', {
      category: 'operational_error',
      component: 'pixSettlementService',
      message: e.message,
      linkedEntityType: type,
    });
    await recordAudit({
      userId,
      action: 'pix.settlement.error',
      entity: 'PixCobranca',
      entityId: pixCobranca.id,
      metadata: {
        linkedEntityType: type,
        requestId: requestId || null,
        code: e.code || null,
      },
      ip: ip || null,
      userAgent: null,
    });
    throw e;
  }

  await recordAudit({
    userId,
    action: 'pix.settlement.unsupported_entity',
    entity: 'PixCobranca',
    entityId: pixCobranca.id,
    metadata: { linkedEntityType: type, requestId: requestId || null },
    ip: ip || null,
    userAgent: null,
  });
  return { settlementResult: 'UNSUPPORTED_ENTITY' };
}

async function settleLoanInsuranceInTx(tx, ctx) {
  const { pixCobranca, chargeId, userId, cobAmount, webhookEventId, requestId, ip } = ctx;
  const releaseKey = releaseIdempotencyKey(pixCobranca.id);

  const existingMov = await tx.movimentacao.findUnique({
    where: { idempotencyKey: releaseKey },
    select: { id: true },
  });
  if (existingMov) {
    return { settlementResult: 'ALREADY_SETTLED' };
  }

  const charge = await tx.loanInsuranceCharge.findFirst({
    where: { id: chargeId, userId },
  });
  if (!charge) {
    return { settlementResult: 'INVALID_STATE' };
  }
  if (!amountsMatch(cobAmount, charge.amount)) {
    return { settlementResult: 'AMOUNT_MISMATCH' };
  }

  if (charge.status === 'pago') {
    return { settlementResult: 'ALREADY_SETTLED' };
  }
  if (charge.status !== 'pendente') {
    return { settlementResult: 'INVALID_STATE' };
  }

  const loan = await tx.emprestimo.findUnique({
    where: { id: charge.loanId },
    select: {
      id: true,
      userId: true,
      status: true,
      insuranceSelected: true,
      insuranceChargeStatus: true,
      valorAprovado: true,
    },
  });
  if (
    !loan ||
    loan.userId !== userId ||
    loan.status !== 'aprovado' ||
    !loan.insuranceSelected ||
    loan.insuranceChargeStatus !== 'pendente'
  ) {
    await recordAudit({
      userId,
      action: 'pix.settlement.loan_insurance.invalid_loan_state',
      entity: 'PixCobranca',
      entityId: pixCobranca.id,
      metadata: { loanId: charge.loanId, requestId: requestId || null },
      ip: ip || null,
      userAgent: null,
    });
    return { settlementResult: 'INVALID_STATE' };
  }

  const principal = Number(loan.valorAprovado);
  if (!Number.isFinite(principal) || principal <= 0) {
    return { settlementResult: 'INVALID_STATE' };
  }

  const updCharge = await tx.loanInsuranceCharge.updateMany({
    where: { id: charge.id, userId, status: 'pendente' },
    data: { status: 'pago', paidAt: pixCobranca.paidAt || new Date() },
  });
  if (updCharge.count !== 1) {
    return { settlementResult: 'ALREADY_SETTLED' };
  }

  let movCredito;
  try {
    movCredito = await registrarCreditoLiberadoDeBloqueado(tx, {
      userId,
      valorLiberado: principal,
      tipo: 'credito',
      descricao: 'Liberação do crédito do empréstimo após seguro (Pix externo)',
      categoria: 'emprestimo_desbloqueio',
      referenceType: 'emprestimo',
      referenceId: loan.id,
      idempotencyKey: releaseKey,
    });
  } catch (e) {
    if (e instanceof LedgerError) {
      await recordAudit({
        userId,
        action: 'pix.settlement.loan_insurance.ledger_error',
        entity: 'PixCobranca',
        entityId: pixCobranca.id,
        metadata: {
          loanId: loan.id,
          ledgerCode: e.code,
          requestId: requestId || null,
        },
        ip: ip || null,
        userAgent: null,
      });
    }
    throw e;
  }

  await tx.emprestimo.update({
    where: { id: loan.id },
    data: {
      fundsStatus: 'disponivel',
      insuranceChargeStatus: 'pago',
    },
  });

  await recordAudit({
    userId,
    action: 'pix.settlement.loan_insurance',
    entity: 'PixCobranca',
    entityId: pixCobranca.id,
    metadata: {
      loanId: loan.id,
      chargeId: charge.id,
      movimentacaoCreditoId: movCredito.id,
      webhookEventId: webhookEventId || null,
      requestId: requestId || null,
    },
    ip: ip || null,
    userAgent: null,
  });

  const fee = Number(charge.amount);
  const postCommit = async () => {
    await notifyLoanInsuranceSettled({
      userId,
      loanId: loan.id,
      movimentacaoFeeId: null,
      movimentacaoCreditoId: movCredito.id,
      fee,
      principal,
      pixCobrancaId: pixCobranca.id,
      paidViaExternalPix: true,
    });
  };

  return { settlementResult: 'SETTLED', postCommit };
}

async function settleCardShipmentFreightInTx(tx, ctx) {
  const { pixCobranca, shipmentId, userId, cobAmount, webhookEventId, requestId, ip } = ctx;

  const shipment = await tx.cardShipment.findFirst({
    where: { id: shipmentId, userId },
  });
  if (!shipment) {
    return { settlementResult: 'INVALID_STATE' };
  }
  if (!amountsMatch(cobAmount, shipment.shippingFeeAmount)) {
    return { settlementResult: 'AMOUNT_MISMATCH' };
  }

  if (String(shipment.shippingFeeStatus) === 'DEBITADO' && shipment.status === 'COBRANCA_CONFIRMADA') {
    return { settlementResult: 'ALREADY_SETTLED' };
  }

  if (String(shipment.shippingFeeStatus) !== 'PENDENTE') {
    return { settlementResult: 'INVALID_STATE' };
  }
  if (String(shipment.status) !== 'AGUARDANDO_COBRANCA') {
    return { settlementResult: 'INVALID_STATE' };
  }

  const now = pixCobranca.paidAt || new Date();
  const upd = await tx.cardShipment.updateMany({
    where: {
      id: shipmentId,
      userId,
      shippingFeeStatus: 'PENDENTE',
      status: 'AGUARDANDO_COBRANCA',
    },
    data: {
      status: 'COBRANCA_CONFIRMADA',
      shippingFeeStatus: 'DEBITADO',
      shippingFeeMovementId: null,
    },
  });
  if (upd.count !== 1) {
    return { settlementResult: 'ALREADY_SETTLED' };
  }

  await tx.cardShipmentEvent.create({
    data: {
      shipmentId,
      userId,
      eventType: 'FRETE_COBRADO',
      shipmentStatus: 'COBRANCA_CONFIRMADA',
      eventAt: now,
      description: 'Frete pago via Pix externo (sem débito em saldoAtual)',
      createdByType: 'SYSTEM',
    },
  });

  await recordAudit({
    userId,
    action: 'pix.settlement.card_shipment_freight',
    entity: 'PixCobranca',
    entityId: pixCobranca.id,
    metadata: {
      shipmentId,
      webhookEventId: webhookEventId || null,
      requestId: requestId || null,
    },
    ip: ip || null,
    userAgent: null,
  });

  const postCommit = async () => {
    await notifyCardShipmentFreightPixSettled({
      userId,
      shipmentId,
      pixCobrancaId: pixCobranca.id,
    });
  };

  return { settlementResult: 'SETTLED', postCommit };
}

async function settleBoletoInTx(tx, ctx) {
  const { pixCobranca, boletoId, userId, cobAmount, webhookEventId, requestId, ip } = ctx;

  const boleto = await tx.boleto.findFirst({
    where: { id: boletoId, userId },
  });
  if (!boleto) {
    return { settlementResult: 'INVALID_STATE' };
  }
  if (!amountsMatch(cobAmount, boleto.valor)) {
    return { settlementResult: 'AMOUNT_MISMATCH' };
  }

  if (String(boleto.status) === 'pago') {
    return { settlementResult: 'ALREADY_SETTLED' };
  }
  if (!['pendente', 'vencido'].includes(String(boleto.status))) {
    return { settlementResult: 'INVALID_STATE' };
  }

  const paidAt = pixCobranca.paidAt || new Date();
  const upd = await tx.boleto.updateMany({
    where: { id: boletoId, userId, status: { in: ['pendente', 'vencido'] } },
    data: { status: 'pago', dataPagamento: paidAt },
  });
  if (upd.count !== 1) {
    return { settlementResult: 'ALREADY_SETTLED' };
  }

  await recordAudit({
    userId,
    action: 'pix.settlement.boleto',
    entity: 'PixCobranca',
    entityId: pixCobranca.id,
    metadata: {
      boletoId,
      webhookEventId: webhookEventId || null,
      requestId: requestId || null,
    },
    ip: ip || null,
    userAgent: null,
  });

  let freightPack = null;
  if (boleto.solicitacaoTipo === 'CARD_SHIPMENT' && boleto.solicitacaoId) {
    freightPack = await settleCardShipmentFreightInTx(tx, {
      pixCobranca,
      shipmentId: boleto.solicitacaoId,
      userId,
      cobAmount,
      webhookEventId,
      requestId,
      ip,
    });
    if (
      freightPack.settlementResult !== 'SETTLED' &&
      freightPack.settlementResult !== 'ALREADY_SETTLED'
    ) {
      await recordAudit({
        userId,
        action: 'pix.settlement.boleto.freight_skipped',
        entity: 'PixCobranca',
        entityId: pixCobranca.id,
        metadata: {
          boletoId,
          shipmentId: boleto.solicitacaoId,
          freightResult: freightPack.settlementResult,
          requestId: requestId || null,
        },
        ip: ip || null,
        userAgent: null,
      });
    }
  }

  const bVal = Number(boleto.valor);
  const postCommit = async () => {
    await notifyBoletoPago({
      userId,
      boletoId,
      movimentacaoId: null,
      valor: bVal,
      paidViaExternalPix: true,
      pixCobrancaId: pixCobranca.id,
    });
    if (freightPack && typeof freightPack.postCommit === 'function') {
      await freightPack.postCommit();
    }
  };

  return { settlementResult: 'SETTLED', postCommit };
}

async function settleAccountDepositInTx(tx, ctx) {
  const { pixCobranca, depositId, userId, cobAmount, webhookEventId, requestId, ip } = ctx;

  const ledgerKey = depositCreditIdempotencyKey(pixCobranca.id);

  const existingMov = await tx.movimentacao.findUnique({
    where: { idempotencyKey: ledgerKey },
    select: { id: true, userId: true },
  });
  if (existingMov) {
    if (existingMov.userId !== userId) {
      await recordAudit({
        userId,
        action: 'pix.settlement.account_deposit.idempotency_conflict',
        entity: 'PixCobranca',
        entityId: pixCobranca.id,
        metadata: { depositId, requestId: requestId || null },
        ip: ip || null,
        userAgent: null,
      });
      return { settlementResult: 'INVALID_STATE' };
    }
    const depRepair = await tx.accountDeposit.findFirst({
      where: { id: depositId, userId },
    });
    if (depRepair && depRepair.status !== 'CREDITADO') {
      await tx.accountDeposit.updateMany({
        where: { id: depositId, userId, status: { not: 'CREDITADO' } },
        data: {
          status: 'CREDITADO',
          creditedMovementId: existingMov.id,
          creditedAt: new Date(),
          paidAt: pixCobranca.paidAt || depRepair.paidAt || new Date(),
          pixCobrancaId: pixCobranca.id,
        },
      });
    }
    return { settlementResult: 'ALREADY_SETTLED' };
  }

  const deposit = await tx.accountDeposit.findFirst({
    where: { id: depositId, userId },
  });
  if (!deposit) {
    return { settlementResult: 'INVALID_STATE' };
  }
  if (deposit.status === 'CREDITADO') {
    return { settlementResult: 'ALREADY_SETTLED' };
  }
  if (!['PIX_GERADO', 'PENDENTE'].includes(String(deposit.status))) {
    return { settlementResult: 'INVALID_STATE' };
  }
  if (deposit.pixCobrancaId && deposit.pixCobrancaId !== pixCobranca.id) {
    return { settlementResult: 'INVALID_STATE' };
  }
  if (!amountsMatch(cobAmount, deposit.amount)) {
    return { settlementResult: 'AMOUNT_MISMATCH' };
  }
  if (
    pixCobranca.grossAmount != null &&
    !amountsMatch(pixCobranca.grossAmount, deposit.amount)
  ) {
    return { settlementResult: 'AMOUNT_MISMATCH' };
  }

  const paidAt = pixCobranca.paidAt || new Date();
  const claimed = await tx.accountDeposit.updateMany({
    where: {
      id: deposit.id,
      userId,
      status: { in: ['PIX_GERADO', 'PENDENTE'] },
    },
    data: {
      status: 'PAGO',
      paidAt,
      pixCobrancaId: pixCobranca.id,
    },
  });
  if (claimed.count !== 1) {
    const again = await tx.accountDeposit.findFirst({
      where: { id: deposit.id, userId },
      select: { status: true },
    });
    if (again && again.status === 'CREDITADO') {
      return { settlementResult: 'ALREADY_SETTLED' };
    }
    return { settlementResult: 'INVALID_STATE' };
  }

  let movCredito;
  try {
    movCredito = await registrarCreditoSaldoAtual(tx, {
      userId,
      valorCredito: Number(deposit.amount),
      tipo: 'credito',
      descricao: 'Crédito por depósito Pix (Efí)',
      categoria: 'deposito_pix',
      referenceType: 'account_deposit',
      referenceId: deposit.id,
      idempotencyKey: ledgerKey,
    });
  } catch (e) {
    if (e instanceof LedgerError) {
      await recordAudit({
        userId,
        action: 'pix.settlement.account_deposit.ledger_error',
        entity: 'PixCobranca',
        entityId: pixCobranca.id,
        metadata: {
          depositId,
          ledgerCode: e.code,
          requestId: requestId || null,
        },
        ip: ip || null,
        userAgent: null,
      });
    }
    throw e;
  }

  await tx.accountDeposit.update({
    where: { id: deposit.id },
    data: {
      status: 'CREDITADO',
      creditedMovementId: movCredito.id,
      creditedAt: new Date(),
    },
  });

  await recordAudit({
    userId,
    action: 'pix.settlement.account_deposit',
    entity: 'PixCobranca',
    entityId: pixCobranca.id,
    metadata: {
      depositId: deposit.id,
      movimentacaoCreditoId: movCredito.id,
      webhookEventId: webhookEventId || null,
      requestId: requestId || null,
    },
    ip: ip || null,
    userAgent: null,
  });

  const creditedAmount = Number(deposit.amount);
  const postCommit = async () => {
    await notifyAccountDepositPixCredited({
      userId,
      depositId: deposit.id,
      movimentacaoId: movCredito.id,
      amount: creditedAmount,
      pixCobrancaId: pixCobranca.id,
    });
  };

  return { settlementResult: 'SETTLED', postCommit };
}

module.exports = {
  settlePaidPixCobrancaInTx,
  settleChargePromotionInTx,
  releaseIdempotencyKey,
  loanInsurancePromoReleaseKey,
  depositCreditIdempotencyKey,
  amountsMatch,
  amountBrlToCents,
  isChargePromotionSettlementEnabled,
};
