const { prisma } = require('../config/database');
const logger = require('../utils/logger');

const NOTIFICATION_TYPE = {
  LOAN_APPROVED_BLOCKED: 'loan_approved_blocked',
  CARD_APPROVED: 'card_approved',
};

function loanApprovedBlockedDedupeKey(loanId) {
  return `loan_approved_blocked:${loanId}`;
}

function cardApprovedDedupeKey(cardId) {
  return `card_approved:${cardId}`;
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

module.exports = {
  NOTIFICATION_TYPE,
  loanApprovedBlockedDedupeKey,
  cardApprovedDedupeKey,
  notifyLoanApprovedBlockedFunds,
  notifyCardApproved,
};
