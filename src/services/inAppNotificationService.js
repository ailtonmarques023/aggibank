const { prisma } = require('../config/database');
const logger = require('../utils/logger');

const NOTIFICATION_TYPE = {
  LOAN_APPROVED_BLOCKED: 'loan_approved_blocked',
  CARD_APPROVED: 'card_approved',
  BOLETO_PAGO: 'boleto_pago',
  LOAN_GUARANTEE_CREDIT_RELEASED: 'loan_guarantee_credit_released',
  LOAN_INSURANCE_SETTLED: 'loan_insurance_settled',
};

function loanApprovedBlockedDedupeKey(loanId) {
  return `loan_approved_blocked:${loanId}`;
}

function cardApprovedDedupeKey(cardId) {
  return `card_approved:${cardId}`;
}

function boletoPagoDedupeKey(boletoId) {
  return `boleto_pago:${boletoId}`;
}

function loanGuaranteeCreditReleasedDedupeKey(loanId) {
  return `loan_guarantee_credit_released:${loanId}`;
}

function loanInsuranceSettledDedupeKey(loanId) {
  return `loan_insurance_settled:${loanId}`;
}

function formatLimiteMensagemBRL(limite) {
  const n = Number(limite);
  if (!Number.isFinite(n)) return String(limite ?? '');
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Idempotente por dedupeKey. Falhas não propagam.
 */
async function notifyCardApproved({ userId, cardId, limiteAprovado }) {
  if (!userId || !cardId) {
    logger.warn({ userId, cardId }, 'notifyCardApproved_skip_missing_ids');
    return null;
  }

  const dedupeKey = cardApprovedDedupeKey(cardId);
  const limiteFmt = formatLimiteMensagemBRL(limiteAprovado);
  const titulo = 'Cartão aprovado';
  const mensagem = `Seu cartão AgilBank foi aprovado com limite de R$ ${limiteFmt}. Acesse Meus cartões para acompanhar a emissão e os detalhes.`;
  const metadata = { cardId, action: 'view_card' };

  try {
    const existing = await prisma.notificacao.findUnique({
      where: { dedupeKey },
      select: { id: true, metadata: true, userId: true },
    });
    if (existing) {
      return existing;
    }

    return await prisma.notificacao.create({
      data: {
        userId,
        titulo,
        mensagem,
        tipo: NOTIFICATION_TYPE.CARD_APPROVED,
        metadata,
        dedupeKey,
      },
    });
  } catch (err) {
    if (err && err.code === 'P2002') {
      logger.info({ dedupeKey }, 'notifyCardApproved_duplicate_ignored');
      return null;
    }
    logger.error({ err: err.message, dedupeKey, userId }, 'notifyCardApproved_failed');
    return null;
  }
}

/**
 * Idempotente por dedupeKey: não duplica para o mesmo empréstimo.
 * Falhas são logadas e não propagadas (não bloqueiam fluxo bancário).
 */
async function notifyLoanApprovedBlockedFunds({ userId, loanId, insuranceSelected }) {
  if (!userId || !loanId) {
    logger.warn({ userId, loanId }, 'notifyLoanApprovedBlockedFunds_skip_missing_ids');
    return null;
  }

  const dedupeKey = loanApprovedBlockedDedupeKey(loanId);
  const titulo = 'Empréstimo aprovado';
  let mensagem;
  let action;
  if (insuranceSelected) {
    mensagem =
      'Seu empréstimo foi aprovado e o valor está bloqueado. Quite o seguro para desbloquear o saldo na sua conta.';
    action = 'pay_insurance';
  } else {
    mensagem =
      'Seu empréstimo foi aprovado e o valor está bloqueado. Apresente uma garantia válida para solicitar o desbloqueio.';
    action = 'submit_guarantee';
  }

  const metadata = { loanId, action };

  try {
    const existing = await prisma.notificacao.findUnique({
      where: { dedupeKey },
      select: { id: true, metadata: true, userId: true },
    });
    if (existing) {
      return existing;
    }

    return await prisma.notificacao.create({
      data: {
        userId,
        titulo,
        mensagem,
        tipo: NOTIFICATION_TYPE.LOAN_APPROVED_BLOCKED,
        metadata,
        dedupeKey,
      },
    });
  } catch (err) {
    if (err && err.code === 'P2002') {
      logger.info({ dedupeKey }, 'notifyLoanApprovedBlockedFunds_duplicate_ignored');
      return null;
    }
    logger.error({ err: err.message, dedupeKey, userId }, 'notifyLoanApprovedBlockedFunds_failed');
    return null;
  }
}

/**
 * Após pagamento de boleto confirmado (fora da transação do pagamento).
 * Idempotente por boletoId. Falhas não propagam.
 */
async function notifyBoletoPago({ userId, boletoId, movimentacaoId, valor }) {
  if (!userId || !boletoId || !movimentacaoId) {
    logger.warn({ userId, boletoId, movimentacaoId }, 'notifyBoletoPago_skip_missing_ids');
    return null;
  }

  const dedupeKey = boletoPagoDedupeKey(boletoId);
  const valorFmt = formatLimiteMensagemBRL(valor);
  const titulo = 'Boleto pago com sucesso';
  const mensagem = `Débito de R$ ${valorFmt} registrado no seu extrato.`;
  const valorNum = Number(valor);
  const metadata = {
    boletoId,
    movimentacaoId,
    valor: Number.isFinite(valorNum) ? valorNum : valor,
    action: 'view_statement',
  };

  try {
    const existing = await prisma.notificacao.findUnique({
      where: { dedupeKey },
      select: { id: true, metadata: true, userId: true },
    });
    if (existing) {
      return existing;
    }

    return await prisma.notificacao.create({
      data: {
        userId,
        titulo,
        mensagem,
        tipo: NOTIFICATION_TYPE.BOLETO_PAGO,
        metadata,
        dedupeKey,
      },
    });
  } catch (err) {
    if (err && err.code === 'P2002') {
      logger.info({ dedupeKey }, 'notifyBoletoPago_duplicate_ignored');
      return null;
    }
    logger.error({ err: err.message, dedupeKey, userId }, 'notifyBoletoPago_failed');
    return null;
  }
}

/**
 * Crédito liberado no saldo após aprovação de garantia (sem seguro).
 * Idempotente por loanId. Falhas não propagam.
 */
async function notifyLoanGuaranteeCreditReleased({ userId, loanId, movimentacaoId, valor }) {
  if (!userId || !loanId || !movimentacaoId) {
    logger.warn({ userId, loanId, movimentacaoId }, 'notifyLoanGuaranteeCreditReleased_skip_missing_ids');
    return null;
  }

  const dedupeKey = loanGuaranteeCreditReleasedDedupeKey(loanId);
  const valorFmt = formatLimiteMensagemBRL(valor);
  const titulo = 'Crédito liberado';
  const mensagem = `Entrada de R$ ${valorFmt} no saldo após aprovação da garantia. Consulte o extrato.`;
  const valorNum = Number(valor);
  const metadata = {
    loanId,
    movimentacaoId,
    valor: Number.isFinite(valorNum) ? valorNum : valor,
    action: 'view_statement',
  };

  try {
    const existing = await prisma.notificacao.findUnique({
      where: { dedupeKey },
      select: { id: true, metadata: true, userId: true },
    });
    if (existing) {
      return existing;
    }

    return await prisma.notificacao.create({
      data: {
        userId,
        titulo,
        mensagem,
        tipo: NOTIFICATION_TYPE.LOAN_GUARANTEE_CREDIT_RELEASED,
        metadata,
        dedupeKey,
      },
    });
  } catch (err) {
    if (err && err.code === 'P2002') {
      logger.info({ dedupeKey }, 'notifyLoanGuaranteeCreditReleased_duplicate_ignored');
      return null;
    }
    logger.error({ err: err.message, dedupeKey, userId }, 'notifyLoanGuaranteeCreditReleased_failed');
    return null;
  }
}

/**
 * Após quitação do seguro: débito da taxa e liberação do principal (fora da transação do pagamento).
 * Idempotente por loanId. Falhas não propagam.
 */
async function notifyLoanInsuranceSettled({
  userId,
  loanId,
  movimentacaoFeeId,
  movimentacaoCreditoId,
  fee,
  principal,
}) {
  if (!userId || !loanId || !movimentacaoFeeId || !movimentacaoCreditoId) {
    logger.warn(
      { userId, loanId, movimentacaoFeeId, movimentacaoCreditoId },
      'notifyLoanInsuranceSettled_skip_missing_ids',
    );
    return null;
  }

  const dedupeKey = loanInsuranceSettledDedupeKey(loanId);
  const feeFmt = formatLimiteMensagemBRL(fee);
  const principalFmt = formatLimiteMensagemBRL(principal);
  const titulo = 'Seguro quitado e crédito liberado';
  const mensagem = `Débito de seguro R$ ${feeFmt} e liberação de R$ ${principalFmt} no saldo. Consulte o extrato.`;
  const feeNum = Number(fee);
  const principalNum = Number(principal);
  const metadata = {
    loanId,
    movimentacaoFeeId,
    movimentacaoCreditoId,
    fee: Number.isFinite(feeNum) ? feeNum : fee,
    principal: Number.isFinite(principalNum) ? principalNum : principal,
    action: 'view_statement',
  };

  try {
    const existing = await prisma.notificacao.findUnique({
      where: { dedupeKey },
      select: { id: true, metadata: true, userId: true },
    });
    if (existing) {
      return existing;
    }

    return await prisma.notificacao.create({
      data: {
        userId,
        titulo,
        mensagem,
        tipo: NOTIFICATION_TYPE.LOAN_INSURANCE_SETTLED,
        metadata,
        dedupeKey,
      },
    });
  } catch (err) {
    if (err && err.code === 'P2002') {
      logger.info({ dedupeKey }, 'notifyLoanInsuranceSettled_duplicate_ignored');
      return null;
    }
    logger.error({ err: err.message, dedupeKey, userId }, 'notifyLoanInsuranceSettled_failed');
    return null;
  }
}

module.exports = {
  NOTIFICATION_TYPE,
  loanApprovedBlockedDedupeKey,
  cardApprovedDedupeKey,
  boletoPagoDedupeKey,
  loanGuaranteeCreditReleasedDedupeKey,
  loanInsuranceSettledDedupeKey,
  notifyLoanApprovedBlockedFunds,
  notifyCardApproved,
  notifyBoletoPago,
  notifyLoanGuaranteeCreditReleased,
  notifyLoanInsuranceSettled,
};
