'use strict';

const { getTransactionLimits } = require('../config/transactionLimits');
const { getSaoPauloDayRangeUtc } = require('../utils/saoPauloDayRange');

/** Status contados para limite diário de depósito (não inclui PENDENTE, CANCELADO, EXPIRADO). */
const DEPOSIT_COUNT_STATUSES = ['PIX_GERADO', 'PAGO', 'CREDITADO'];

function moneyNum(v) {
  if (v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Limites diários na geração de novo depósito Pix (não aplicar em settlement/recovery).
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} userId
 * @param {number} proposedAmountBrl
 */
async function assertDepositDailyLimits(prisma, userId, proposedAmountBrl) {
  const lim = getTransactionLimits({ userId }).deposit;
  const { start, end } = getSaoPauloDayRangeUtc();

  const agg = await prisma.accountDeposit.aggregate({
    where: {
      userId,
      createdAt: { gte: start, lt: end },
      status: { in: DEPOSIT_COUNT_STATUSES },
    },
    _sum: { amount: true },
    _count: { _all: true },
  });

  const sumExisting = moneyNum(agg._sum.amount);
  const countExisting = agg._count._all;

  if (countExisting >= lim.dailyCountLimit) {
    return {
      ok: false,
      httpStatus: 400,
      code: 'DEPOSIT_DAILY_COUNT_LIMIT_EXCEEDED',
      message:
        'Você atingiu a quantidade diária de depósitos. Tente novamente amanhã.',
    };
  }

  const totalAfter = sumExisting + proposedAmountBrl;
  if (totalAfter > lim.dailyAmountLimit + 1e-9) {
    return {
      ok: false,
      httpStatus: 400,
      code: 'DEPOSIT_DAILY_AMOUNT_LIMIT_EXCEEDED',
      message:
        'Você atingiu o limite diário de depósitos em valor. Reduza o valor ou tente novamente amanhã.',
    };
  }

  return { ok: true };
}

/**
 * Limites diários no envio de transferência interna.
 * - Soma em valor: apenas CONCLUIDA (dinheiro efetivamente debitado).
 * - Quantidade: CONCLUIDA + PENDENTE (anti-spam / tentativas que passaram da checagem pré-transação).
 *
 * Deve ser chamado após replay idempotente válido (não consumir limite de novo no replay).
 */
async function assertInternalTransferDailyLimits(prisma, fromUserId, proposedAmountBrl) {
  const lim = getTransactionLimits({ userId: fromUserId }).internalTransfer;
  const { start, end } = getSaoPauloDayRangeUtc();

  const sumAgg = await prisma.internalTransfer.aggregate({
    where: {
      fromUserId,
      createdAt: { gte: start, lt: end },
      status: 'CONCLUIDA',
    },
    _sum: { amount: true },
  });

  const sumExisting = moneyNum(sumAgg._sum.amount);

  const countExisting = await prisma.internalTransfer.count({
    where: {
      fromUserId,
      createdAt: { gte: start, lt: end },
      status: { in: ['CONCLUIDA', 'PENDENTE'] },
    },
  });

  if (countExisting >= lim.dailyCountLimit) {
    return {
      ok: false,
      httpStatus: 400,
      code: 'TRANSFER_DAILY_COUNT_LIMIT_EXCEEDED',
      message:
        'Você atingiu a quantidade diária de transferências. Tente novamente amanhã.',
    };
  }

  const totalAfter = sumExisting + proposedAmountBrl;
  if (totalAfter > lim.dailyAmountLimit + 1e-9) {
    return {
      ok: false,
      httpStatus: 400,
      code: 'TRANSFER_DAILY_AMOUNT_LIMIT_EXCEEDED',
      message:
        'Você atingiu o limite diário de transferências em valor. Reduza o valor ou tente novamente amanhã.',
    };
  }

  return { ok: true };
}

module.exports = {
  assertDepositDailyLimits,
  assertInternalTransferDailyLimits,
  DEPOSIT_COUNT_STATUSES,
};
