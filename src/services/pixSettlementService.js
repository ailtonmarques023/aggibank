'use strict';

const logger = require('../utils/logger');
const { recordAudit } = require('../utils/auditLog');
const {
  registrarCreditoLiberadoDeBloqueado,
  LedgerError,
} = require('./ledgerService');
const {
  notifyLoanInsuranceSettled,
  notifyBoletoPago,
  notifyCardShipmentFreightPixSettled,
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

module.exports = {
  settlePaidPixCobrancaInTx,
  releaseIdempotencyKey,
  amountsMatch,
};
