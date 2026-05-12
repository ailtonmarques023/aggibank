'use strict';

/**
 * Limites operacionais — depósito Pix e transferência interna.
 *
 * **MVP:** uma única faixa (`mvp`) até existir nível de conta persistido e regras de produto.
 * **Evolução:** implementar `resolveTransactionLimitsTier` com base em usuário/conta (Prisma)
 * e adicionar chaves em `TRANSACTION_LIMITS_BY_TIER` sem alterar consumidores.
 */
const TRANSACTION_LIMITS_BY_TIER = {
  mvp: {
    deposit: {
      minAmount: 1,
      maxAmount: 10000,
      dailyAmountLimit: 30000,
      dailyCountLimit: 20,
    },
    internalTransfer: {
      minAmount: 1,
      maxAmount: 10000,
      dailyAmountLimit: 30000,
      dailyCountLimit: 30,
    },
  },
};

const DEFAULT_TRANSACTION_LIMITS_TIER = 'mvp';

/**
 * @param {{ userId?: string, user?: object, accountTier?: string }} [ctx]
 * @returns {string}
 */
function resolveTransactionLimitsTier(ctx = {}) {
  if (ctx.accountTier && TRANSACTION_LIMITS_BY_TIER[ctx.accountTier]) {
    return ctx.accountTier;
  }
  // Futuro: ex. prisma.user.findUnique({ where: { id: ctx.userId }, select: { accountTier: true } })
  return DEFAULT_TRANSACTION_LIMITS_TIER;
}

/**
 * @param {{ userId?: string, user?: object, accountTier?: string }} [ctx]
 * @returns {{ deposit: object, internalTransfer: object }}
 */
function getTransactionLimits(ctx = {}) {
  const tier = resolveTransactionLimitsTier(ctx);
  const pack = TRANSACTION_LIMITS_BY_TIER[tier];
  if (!pack) {
    return TRANSACTION_LIMITS_BY_TIER[DEFAULT_TRANSACTION_LIMITS_TIER];
  }
  return pack;
}

module.exports = {
  TRANSACTION_LIMITS_BY_TIER,
  DEFAULT_TRANSACTION_LIMITS_TIER,
  resolveTransactionLimitsTier,
  getTransactionLimits,
  /** Compat: limites efetivos no tier padrão atual */
  get deposit() {
    return getTransactionLimits().deposit;
  },
  get internalTransfer() {
    return getTransactionLimits().internalTransfer;
  },
};
