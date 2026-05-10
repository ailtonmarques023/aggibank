'use strict';

/**
 * Serviço central de movimentações: débito em saldoAtual + persistência de Movimentacao na mesma transação Prisma.
 * Não envia notificações (mantido nos fluxos chamadores quando já existirem).
 *
 * @param {import('@prisma/client').Prisma.TransactionClient} prismaTx
 */

class LedgerError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {number} [httpStatus=400]
   */
  constructor(code, message, httpStatus = 400) {
    super(message);
    this.name = 'LedgerError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

function toPositiveAmount(valor) {
  const n = Number(valor);
  if (!Number.isFinite(n) || n <= 0) {
    throw new LedgerError('LEDGER_INVALID_AMOUNT', 'Valor da movimentação inválido', 400);
  }
  return Math.round(n * 100) / 100;
}

/**
 * Registra débito em saldo disponível (saldoAtual) e cria linha em Movimentacao.
 * `valorDebito` é sempre interpretado como valor absoluto positivo; a linha gravada usa valor negativo.
 *
 * @param {import('@prisma/client').Prisma.TransactionClient} prismaTx
 * @param {object} params
 * @param {string} params.userId
 * @param {number|string|import('@prisma/client').Prisma.Decimal} params.valorDebito
 * @param {string} params.tipo — ex.: 'boleto', 'pix'
 * @param {string} params.descricao
 * @param {string} [params.categoria]
 * @param {string} [params.referenceType]
 * @param {string} [params.referenceId]
 * @param {string} [params.idempotencyKey]
 */
async function registrarDebitoSaldoAtual(prismaTx, params) {
  const {
    userId,
    valorDebito,
    tipo,
    descricao,
    categoria,
    referenceType,
    referenceId,
    idempotencyKey,
  } = params;

  if (!userId || typeof userId !== 'string') {
    throw new LedgerError('LEDGER_USER_REQUIRED', 'Identificação do titular ausente', 400);
  }
  if (!tipo || !descricao) {
    throw new LedgerError('LEDGER_FIELDS_REQUIRED', 'Tipo e descrição são obrigatórios', 400);
  }

  const amount = toPositiveAmount(valorDebito);

  const user = await prismaTx.user.findUnique({
    where: { id: userId },
    select: { saldoAtual: true },
  });

  if (!user) {
    throw new LedgerError('LEDGER_USER_NOT_FOUND', 'Titular não encontrado', 404);
  }

  const saldoAntes = Number(user.saldoAtual);
  if (!Number.isFinite(saldoAntes) || saldoAntes < amount) {
    throw new LedgerError('INSUFFICIENT_BALANCE', 'Saldo insuficiente', 400);
  }

  const saldoDepois = Math.round((saldoAntes - amount) * 100) / 100;

  await prismaTx.user.update({
    where: { id: userId },
    data: { saldoAtual: saldoDepois },
  });

  const data = {
    userId,
    tipo,
    descricao,
    valor: -amount,
    saldoAnterior: saldoAntes,
    saldoAtual: saldoDepois,
    categoria: categoria ?? null,
    referenceType: referenceType ?? null,
    referenceId: referenceId ?? null,
  };
  if (idempotencyKey) {
    data.idempotencyKey = idempotencyKey;
  }

  const movimentacao = await prismaTx.movimentacao.create({ data });

  return movimentacao;
}

/**
 * Crédito em saldo disponível com redução de saldo bloqueado no mesmo valor.
 * Uso típico: liberação do principal aprovado após garantia (sem seguro).
 *
 * @param {import('@prisma/client').Prisma.TransactionClient} prismaTx
 * @param {object} params
 * @param {string} params.userId
 * @param {number|string} params.valorLiberado — valor creditado e retirado do bloqueado
 * @param {string} params.tipo — ex.: 'credito'
 * @param {string} params.descricao
 * @param {string} [params.categoria]
 * @param {string} [params.referenceType]
 * @param {string} [params.referenceId]
 * @param {string} [params.idempotencyKey]
 */
async function registrarCreditoLiberadoDeBloqueado(prismaTx, params) {
  const {
    userId,
    valorLiberado,
    tipo,
    descricao,
    categoria,
    referenceType,
    referenceId,
    idempotencyKey,
  } = params;

  if (!userId || typeof userId !== 'string') {
    throw new LedgerError('LEDGER_USER_REQUIRED', 'Identificação do titular ausente', 400);
  }
  if (!tipo || !descricao) {
    throw new LedgerError('LEDGER_FIELDS_REQUIRED', 'Tipo e descrição são obrigatórios', 400);
  }

  const amount = toPositiveAmount(valorLiberado);

  const user = await prismaTx.user.findUnique({
    where: { id: userId },
    select: { saldoAtual: true, saldoBloqueado: true },
  });

  if (!user) {
    throw new LedgerError('LEDGER_USER_NOT_FOUND', 'Titular não encontrado', 404);
  }

  const saldoAntes = Number(user.saldoAtual);
  const bloqueadoAntes = Number(user.saldoBloqueado);

  if (!Number.isFinite(saldoAntes) || !Number.isFinite(bloqueadoAntes)) {
    throw new LedgerError('LEDGER_BALANCE_INVALID', 'Saldos inválidos', 400);
  }

  if (bloqueadoAntes < amount) {
    throw new LedgerError(
      'INSUFFICIENT_BLOCKED_BALANCE',
      'Saldo bloqueado insuficiente para liberação',
      400,
    );
  }

  const saldoDepois = Math.round((saldoAntes + amount) * 100) / 100;
  const bloqueadoDepois = Math.round((bloqueadoAntes - amount) * 100) / 100;

  await prismaTx.user.update({
    where: { id: userId },
    data: {
      saldoAtual: saldoDepois,
      saldoBloqueado: bloqueadoDepois,
    },
  });

  const data = {
    userId,
    tipo,
    descricao,
    valor: amount,
    saldoAnterior: saldoAntes,
    saldoAtual: saldoDepois,
    categoria: categoria ?? null,
    referenceType: referenceType ?? null,
    referenceId: referenceId ?? null,
  };
  if (idempotencyKey) {
    data.idempotencyKey = idempotencyKey;
  }

  const movimentacao = await prismaTx.movimentacao.create({ data });

  return movimentacao;
}

/**
 * Crédito apenas em saldoBloqueado (sem alterar saldoAtual) + linha informativa no extrato.
 * Uso: aprovação de empréstimo com principal bloqueado até seguro ou garantia.
 *
 * @param {import('@prisma/client').Prisma.TransactionClient} prismaTx
 * @param {object} params
 * @param {string} params.userId
 * @param {number|string} params.valorBloqueado
 * @param {string} [params.tipo] — deve ser `credito_bloqueado`
 * @param {string} params.descricao
 * @param {string} [params.categoria]
 * @param {string} [params.referenceType]
 * @param {string} params.referenceId
 * @param {string} params.idempotencyKey
 */
async function registrarCreditoSaldoBloqueado(prismaTx, params) {
  const {
    userId,
    valorBloqueado,
    tipo = 'credito_bloqueado',
    descricao,
    categoria = 'emprestimo',
    referenceType = 'emprestimo',
    referenceId,
    idempotencyKey,
  } = params;

  if (!userId || typeof userId !== 'string') {
    throw new LedgerError('LEDGER_USER_REQUIRED', 'Identificação do titular ausente', 400);
  }
  if (tipo !== 'credito_bloqueado') {
    throw new LedgerError(
      'LEDGER_FIELDS_REQUIRED',
      'Tipo deve ser credito_bloqueado para bloqueio de empréstimo',
      400,
    );
  }
  if (!descricao) {
    throw new LedgerError('LEDGER_FIELDS_REQUIRED', 'Descrição é obrigatória', 400);
  }
  if (!referenceId || typeof referenceId !== 'string') {
    throw new LedgerError('LEDGER_FIELDS_REQUIRED', 'referenceId do empréstimo é obrigatório', 400);
  }
  if (!idempotencyKey || typeof idempotencyKey !== 'string') {
    throw new LedgerError('LEDGER_FIELDS_REQUIRED', 'idempotencyKey é obrigatório', 400);
  }

  const existing = await prismaTx.movimentacao.findUnique({
    where: { idempotencyKey },
  });
  if (existing) {
    if (existing.userId !== userId) {
      throw new LedgerError(
        'LEDGER_IDEMPOTENCY_CONFLICT',
        'Chave de idempotência pertence a outro titular',
        409,
      );
    }
    return existing;
  }

  const amount = toPositiveAmount(valorBloqueado);

  const user = await prismaTx.user.findUnique({
    where: { id: userId },
    select: { saldoAtual: true, saldoBloqueado: true },
  });

  if (!user) {
    throw new LedgerError('LEDGER_USER_NOT_FOUND', 'Titular não encontrado', 404);
  }

  const saldoDisponivel = Number(user.saldoAtual);
  const bloqueadoNum = Number(user.saldoBloqueado);
  if (!Number.isFinite(saldoDisponivel) || !Number.isFinite(bloqueadoNum)) {
    throw new LedgerError('LEDGER_BALANCE_INVALID', 'Saldos inválidos', 400);
  }

  await prismaTx.user.update({
    where: { id: userId },
    data: {
      saldoBloqueado: { increment: amount },
    },
  });

  const movimentacao = await prismaTx.movimentacao.create({
    data: {
      userId,
      tipo: 'credito_bloqueado',
      descricao,
      valor: amount,
      saldoAnterior: saldoDisponivel,
      saldoAtual: saldoDisponivel,
      categoria,
      referenceType,
      referenceId,
      idempotencyKey,
    },
  });

  return movimentacao;
}

/**
 * Crédito em saldo disponível (saldoAtual) + linha em Movimentacao (valor positivo).
 * Idempotência obrigatória por `idempotencyKey` (global na tabela).
 *
 * @param {import('@prisma/client').Prisma.TransactionClient} prismaTx
 * @param {object} params
 * @param {string} params.userId
 * @param {number|string} params.valorCredito
 * @param {string} [params.tipo='credito']
 * @param {string} params.descricao
 * @param {string} [params.categoria]
 * @param {string} [params.referenceType]
 * @param {string} [params.referenceId]
 * @param {string} params.idempotencyKey
 */
async function registrarCreditoSaldoAtual(prismaTx, params) {
  const {
    userId,
    valorCredito,
    tipo = 'credito',
    descricao,
    categoria = null,
    referenceType = null,
    referenceId = null,
    idempotencyKey,
  } = params;

  if (!userId || typeof userId !== 'string') {
    throw new LedgerError('LEDGER_USER_REQUIRED', 'Identificação do titular ausente', 400);
  }
  if (!tipo || !descricao) {
    throw new LedgerError('LEDGER_FIELDS_REQUIRED', 'Tipo e descrição são obrigatórios', 400);
  }
  if (!idempotencyKey || typeof idempotencyKey !== 'string') {
    throw new LedgerError('LEDGER_FIELDS_REQUIRED', 'idempotencyKey é obrigatório', 400);
  }

  const existing = await prismaTx.movimentacao.findUnique({
    where: { idempotencyKey },
  });
  if (existing) {
    if (existing.userId !== userId) {
      throw new LedgerError(
        'LEDGER_IDEMPOTENCY_CONFLICT',
        'Chave de idempotência pertence a outro titular',
        409,
      );
    }
    return existing;
  }

  const amount = toPositiveAmount(valorCredito);

  const user = await prismaTx.user.findUnique({
    where: { id: userId },
    select: { saldoAtual: true },
  });

  if (!user) {
    throw new LedgerError('LEDGER_USER_NOT_FOUND', 'Titular não encontrado', 404);
  }

  const saldoAntes = Number(user.saldoAtual);
  if (!Number.isFinite(saldoAntes)) {
    throw new LedgerError('LEDGER_BALANCE_INVALID', 'Saldo inválido', 400);
  }

  const saldoDepois = Math.round((saldoAntes + amount) * 100) / 100;

  await prismaTx.user.update({
    where: { id: userId },
    data: { saldoAtual: saldoDepois },
  });

  const movimentacao = await prismaTx.movimentacao.create({
    data: {
      userId,
      tipo,
      descricao,
      valor: amount,
      saldoAnterior: saldoAntes,
      saldoAtual: saldoDepois,
      categoria,
      referenceType,
      referenceId,
      idempotencyKey,
    },
  });

  return movimentacao;
}

module.exports = {
  LedgerError,
  registrarDebitoSaldoAtual,
  registrarCreditoLiberadoDeBloqueado,
  registrarCreditoSaldoBloqueado,
  registrarCreditoSaldoAtual,
};
