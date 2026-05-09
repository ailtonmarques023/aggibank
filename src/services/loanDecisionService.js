const { prisma, transaction } = require('../config/database');
const logger = require('../utils/logger');
const { recordAudit } = require('../utils/auditLog');
const { notifyLoanApprovedBlockedFunds } = require('./inAppNotificationService');
const { scheduleLoanApprovedBlockedEmail } = require('./loanApprovedBlockedEmailService');

const LOAN_INSURANCE_FEE_BRL = 39.9;

class LoanDecisionError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function normalizeApprovalValue(inputValue, requestedValue) {
  const value =
    requestedValue === undefined || requestedValue === null
      ? Number(inputValue)
      : Number(requestedValue);

  if (!Number.isFinite(value) || value <= 0) {
    throw new LoanDecisionError(
      'INVALID_APPROVAL_VALUE',
      'valorAprovado deve ser um número positivo',
      400
    );
  }

  return value;
}

const loanPublicSelect = {
  id: true,
  userId: true,
  valorSolicitado: true,
  valorAprovado: true,
  prazoMeses: true,
  taxaJuros: true,
  valorParcela: true,
  status: true,
  insuranceSelected: true,
  insuranceAmount: true,
  insuranceTermsAccepted: true,
  fundsStatus: true,
  blockedAmount: true,
  guaranteeStatus: true,
  insuranceChargeStatus: true,
  dataSolicitacao: true,
  dataAprovacao: true,
  dataQuitacao: true,
};

async function listLoansByStatus(status = 'pendente') {
  return prisma.emprestimo.findMany({
    where: { status },
    orderBy: { dataSolicitacao: 'asc' },
    select: loanPublicSelect,
  });
}

async function getLoanById(id) {
  return prisma.emprestimo.findUnique({
    where: { id },
    select: loanPublicSelect,
  });
}

const borrowerSelect = {
  id: true,
  nomeCompleto: true,
  email: true,
};

function withBorrower(row) {
  if (!row) return null;
  const { user, ...rest } = row;
  return { ...rest, borrower: user || null };
}

async function listLoansByStatusWithBorrower(status = 'pendente') {
  const rows = await prisma.emprestimo.findMany({
    where: { status },
    orderBy: { dataSolicitacao: 'asc' },
    select: {
      ...loanPublicSelect,
      user: { select: borrowerSelect },
    },
  });
  return rows.map(withBorrower);
}

async function getLoanByIdWithBorrower(id) {
  const row = await prisma.emprestimo.findUnique({
    where: { id },
    select: {
      ...loanPublicSelect,
      user: { select: borrowerSelect },
    },
  });
  return withBorrower(row);
}

function isInsuranceSelected(emprestimo) {
  return Boolean(emprestimo && emprestimo.insuranceSelected);
}

function isInsuranceTermsAccepted(emprestimo) {
  return Boolean(emprestimo && emprestimo.insuranceTermsAccepted);
}

/**
 * Aprova proposta pendente: crédito em saldoBloqueado, sem incrementar saldoAtual.
 * Deve rodar dentro de prisma.$transaction.
 */
async function applyApprovedLoanBlockedFundsInTx(prismaTx, loanId, emprestimoSnapshot, valorCredito) {
  const withInsurance = isInsuranceSelected(emprestimoSnapshot);

  const contaDono = await prismaTx.user.findUnique({
    where: { id: emprestimoSnapshot.userId },
    select: { saldoAtual: true, saldoBloqueado: true },
  });

  if (!contaDono) {
    throw new LoanDecisionError('LOAN_OWNER_NOT_FOUND', 'Titular do empréstimo não encontrado', 404);
  }

  const saldoDisponivelAntes = Number(contaDono.saldoAtual);

  const updateResult = await prismaTx.emprestimo.updateMany({
    where: { id: loanId, status: 'pendente' },
    data: {
      status: 'aprovado',
      valorAprovado: valorCredito,
      dataAprovacao: new Date(),
      fundsStatus: 'bloqueado',
      blockedAmount: valorCredito,
      guaranteeStatus: withInsurance ? 'not_required' : 'pending',
      insuranceChargeStatus: withInsurance ? 'pendente' : null,
    },
  });

  if (updateResult.count !== 1) {
    throw new LoanDecisionError('LOAN_ALREADY_DECIDED', 'Empréstimo já foi processado', 400);
  }

  await prismaTx.user.update({
    where: { id: emprestimoSnapshot.userId },
    data: {
      saldoBloqueado: {
        increment: valorCredito,
      },
    },
  });

  if (withInsurance) {
    const existingCharge = await prismaTx.loanInsuranceCharge.findUnique({
      where: { loanId },
    });
    if (!existingCharge) {
      await prismaTx.loanInsuranceCharge.create({
        data: {
          loanId,
          userId: emprestimoSnapshot.userId,
          amount: LOAN_INSURANCE_FEE_BRL,
          status: 'pendente',
        },
      });
    }
  }

  await prismaTx.movimentacao.create({
    data: {
      userId: emprestimoSnapshot.userId,
      tipo: 'credito_bloqueado',
      descricao: withInsurance
        ? 'Empréstimo aprovado — crédito bloqueado até pagamento do seguro (R$ 39,90)'
        : 'Empréstimo aprovado — crédito bloqueado até garantia aprovada',
      valor: valorCredito,
      saldoAnterior: saldoDisponivelAntes,
      saldoAtual: saldoDisponivelAntes,
      categoria: 'emprestimo',
      referenceType: 'emprestimo',
      referenceId: loanId,
    },
  });

  return prismaTx.emprestimo.findUnique({
    where: { id: loanId },
    select: loanPublicSelect,
  });
}

async function approveLoanDecision({ loanId, valorAprovado, actorId, actorMeta = {} }) {
  const emprestimo = await prisma.emprestimo.findUnique({ where: { id: loanId } });

  if (!emprestimo) {
    throw new LoanDecisionError('LOAN_NOT_FOUND', 'Empréstimo não encontrado', 404);
  }

  if (emprestimo.status !== 'pendente') {
    throw new LoanDecisionError('LOAN_ALREADY_DECIDED', 'Empréstimo já foi processado', 400);
  }

  if (isInsuranceSelected(emprestimo) && !isInsuranceTermsAccepted(emprestimo)) {
    throw new LoanDecisionError(
      'LOAN_INSURANCE_TERMS_REQUIRED',
      'Proposta com seguro exige aceite dos termos do seguro antes da aprovação',
      400
    );
  }

  const valorCredito = normalizeApprovalValue(emprestimo.valorSolicitado, valorAprovado);

  const resultado = await transaction(async (prismaTx) =>
    applyApprovedLoanBlockedFundsInTx(prismaTx, loanId, emprestimo, valorCredito)
  );

  logger.logCriticalOperation('loan_approved', actorId || 'internal-admin', valorCredito, {
    emprestimoId: loanId,
    loanOwnerId: emprestimo.userId,
    prazoMeses: emprestimo.prazoMeses,
    insuranceSelected: isInsuranceSelected(emprestimo),
    fundsStatus: 'bloqueado',
    actorMeta,
  });

  await recordAudit({
    userId: actorId || null,
    action: 'loan_approved',
    entity: 'emprestimo',
    entityId: loanId,
    metadata: {
      actorMeta,
      loanOwnerId: emprestimo.userId,
      valorAprovado: valorCredito,
      previousStatus: 'pendente',
      currentStatus: 'aprovado',
      fundsStatus: 'bloqueado',
      insuranceSelected: isInsuranceSelected(emprestimo),
    },
  });

  return resultado;
}

/**
 * Fluxo comum: cria proposta e aprova automaticamente com crédito bloqueado (uma transação).
 */
async function createPersonalLoanAutoApproved({
  userId,
  valorSolicitado,
  prazoMeses,
  taxaJuros,
  valorParcela,
  insuranceSelected,
  insuranceTermsAccepted,
  insuranceAmount,
  actorId,
  actorMeta = {},
}) {
  if (insuranceSelected && !insuranceTermsAccepted) {
    throw new LoanDecisionError(
      'LOAN_INSURANCE_TERMS_REQUIRED',
      'Proposta com seguro exige aceite dos termos do seguro antes da contratação',
      400
    );
  }

  const resultado = await transaction(async (prismaTx) => {
    const created = await prismaTx.emprestimo.create({
      data: {
        userId,
        valorSolicitado,
        prazoMeses,
        taxaJuros,
        valorParcela,
        status: 'pendente',
        insuranceSelected,
        insuranceTermsAccepted,
        insuranceAmount: insuranceSelected ? LOAN_INSURANCE_FEE_BRL : insuranceAmount,
        guaranteeStatus: insuranceSelected ? 'not_required' : 'pending',
      },
    });

    const valorCredito = normalizeApprovalValue(created.valorSolicitado, undefined);

    return applyApprovedLoanBlockedFundsInTx(prismaTx, created.id, created, valorCredito);
  });

  const valorCredito = Number(resultado.valorAprovado);

  logger.logCriticalOperation('loan_approved', actorId || 'system-auto', valorCredito, {
    emprestimoId: resultado.id,
    loanOwnerId: userId,
    prazoMeses: resultado.prazoMeses,
    insuranceSelected: isInsuranceSelected(resultado),
    fundsStatus: 'bloqueado',
    actorMeta: { ...actorMeta, autoApproved: true },
  });

  await recordAudit({
    userId: actorId || null,
    action: 'loan_auto_approved',
    entity: 'emprestimo',
    entityId: resultado.id,
    metadata: {
      actorMeta,
      loanOwnerId: userId,
      valorAprovado: valorCredito,
      previousStatus: 'pendente',
      currentStatus: 'aprovado',
      fundsStatus: 'bloqueado',
      insuranceSelected: isInsuranceSelected(resultado),
    },
  });

  await notifyLoanApprovedBlockedFunds({
    userId,
    loanId: resultado.id,
    insuranceSelected: isInsuranceSelected(resultado),
  });

  scheduleLoanApprovedBlockedEmail({
    loanId: resultado.id,
    userId,
    insuranceSelected: isInsuranceSelected(resultado),
    valorAprovado: Number(resultado.valorAprovado),
  });

  return resultado;
}

/**
 * Pagamento do seguro pelo titular: debita taxa do saldo disponível e libera o principal para saldo disponível.
 */
async function payLoanInsuranceCharge({ loanId, userId }) {
  const loan = await prisma.emprestimo.findUnique({
    where: { id: loanId },
    select: {
      ...loanPublicSelect,
    },
  });

  if (!loan || loan.userId !== userId) {
    throw new LoanDecisionError('LOAN_NOT_FOUND', 'Empréstimo não encontrado', 404);
  }

  if (loan.status !== 'aprovado') {
    throw new LoanDecisionError('LOAN_INVALID_STATE', 'Empréstimo não está aprovado', 400);
  }

  if (!isInsuranceSelected(loan)) {
    throw new LoanDecisionError('LOAN_INSURANCE_NOT_SELECTED', 'Esta proposta não possui seguro', 400);
  }

  if (loan.insuranceChargeStatus !== 'pendente') {
    throw new LoanDecisionError(
      'LOAN_INSURANCE_ALREADY_SETTLED',
      'Cobrança de seguro já foi quitada ou não se aplica',
      400
    );
  }

  const charge = await prisma.loanInsuranceCharge.findUnique({
    where: { loanId },
  });

  if (!charge || charge.status !== 'pendente') {
    throw new LoanDecisionError('LOAN_INSURANCE_CHARGE_NOT_FOUND', 'Cobrança de seguro não encontrada', 404);
  }

  const fee = Number(charge.amount);
  const principal = Number(loan.valorAprovado);

  if (!Number.isFinite(fee) || fee <= 0 || !Number.isFinite(principal) || principal <= 0) {
    throw new LoanDecisionError('LOAN_INVALID_AMOUNTS', 'Valores de empréstimo ou seguro inválidos', 400);
  }

  return transaction(async (prismaTx) => {
    const userRow = await prismaTx.user.findUnique({
      where: { id: userId },
      select: { saldoAtual: true, saldoBloqueado: true },
    });

    if (!userRow) {
      throw new LoanDecisionError('USER_NOT_FOUND', 'Usuário não encontrado', 404);
    }

    const saldoAntes = Number(userRow.saldoAtual);
    const bloqueadoAntes = Number(userRow.saldoBloqueado);

    if (saldoAntes < fee) {
      throw new LoanDecisionError(
        'INSUFFICIENT_BALANCE_FOR_INSURANCE',
        'Saldo disponível insuficiente para pagar o seguro do empréstimo',
        400
      );
    }

    if (bloqueadoAntes < principal) {
      throw new LoanDecisionError(
        'BLOCKED_BALANCE_MISMATCH',
        'Saldo bloqueado inconsistente com o valor aprovado',
        400
      );
    }

    const updateCharge = await prismaTx.loanInsuranceCharge.updateMany({
      where: { loanId, status: 'pendente' },
      data: { status: 'pago', paidAt: new Date() },
    });

    if (updateCharge.count !== 1) {
      throw new LoanDecisionError(
        'LOAN_INSURANCE_ALREADY_SETTLED',
        'Cobrança de seguro já foi quitada',
        400
      );
    }

    const saldoAposTaxa = saldoAntes - fee;
    const saldoFinal = saldoAposTaxa + principal;

    await prismaTx.user.update({
      where: { id: userId },
      data: {
        saldoAtual: { increment: principal - fee },
        saldoBloqueado: { decrement: principal },
      },
    });

    await prismaTx.emprestimo.update({
      where: { id: loanId },
      data: {
        fundsStatus: 'disponivel',
        insuranceChargeStatus: 'pago',
      },
    });

    await prismaTx.movimentacao.create({
      data: {
        userId,
        tipo: 'debito',
        descricao: 'Pagamento seguro de empréstimo (valor único)',
        valor: fee,
        saldoAnterior: saldoAntes,
        saldoAtual: saldoAposTaxa,
        categoria: 'seguro_emprestimo',
        referenceType: 'loan_insurance_charge',
        referenceId: charge.id,
      },
    });

    await prismaTx.movimentacao.create({
      data: {
        userId,
        tipo: 'credito',
        descricao: 'Liberação do crédito do empréstimo após seguro',
        valor: principal,
        saldoAnterior: saldoAposTaxa,
        saldoAtual: saldoFinal,
        categoria: 'emprestimo_desbloqueio',
        referenceType: 'emprestimo',
        referenceId: loanId,
      },
    });

    logger.banking('loan_insurance_paid', userId, { loanId, fee, principal });

    return prismaTx.emprestimo.findUnique({
      where: { id: loanId },
      select: loanPublicSelect,
    });
  });
}

/**
 * Desbloqueio após garantia aprovada (sem seguro). Uso interno / operacional.
 */
async function releaseLoanFundsAfterGuaranteeApproved({ loanId, actorId, actorMeta = {} }) {
  const loan = await prisma.emprestimo.findUnique({
    where: { id: loanId },
    select: loanPublicSelect,
  });

  if (!loan) {
    throw new LoanDecisionError('LOAN_NOT_FOUND', 'Empréstimo não encontrado', 404);
  }

  if (loan.status !== 'aprovado') {
    throw new LoanDecisionError('LOAN_INVALID_STATE', 'Empréstimo não está aprovado', 400);
  }

  if (isInsuranceSelected(loan)) {
    throw new LoanDecisionError(
      'LOAN_GUARANTEE_NOT_APPLICABLE',
      'Desbloqueio por garantia não se aplica a proposta com seguro',
      400
    );
  }

  if (loan.guaranteeStatus !== 'pending' && loan.guaranteeStatus !== 'submitted') {
    throw new LoanDecisionError(
      'LOAN_GUARANTEE_INVALID_STATE',
      'Garantia não está pendente de análise',
      400
    );
  }

  const principal = Number(loan.valorAprovado);
  if (!Number.isFinite(principal) || principal <= 0) {
    throw new LoanDecisionError('LOAN_INVALID_AMOUNTS', 'Valor aprovado inválido', 400);
  }

  return transaction(async (prismaTx) => {
    const userRow = await prismaTx.user.findUnique({
      where: { id: loan.userId },
      select: { saldoAtual: true, saldoBloqueado: true },
    });

    if (!userRow) {
      throw new LoanDecisionError('LOAN_OWNER_NOT_FOUND', 'Titular não encontrado', 404);
    }

    const saldoAntes = Number(userRow.saldoAtual);
    const bloqueadoAntes = Number(userRow.saldoBloqueado);

    if (bloqueadoAntes < principal) {
      throw new LoanDecisionError(
        'BLOCKED_BALANCE_MISMATCH',
        'Saldo bloqueado inconsistente com o valor aprovado',
        400
      );
    }

    const updated = await prismaTx.emprestimo.updateMany({
      where: {
        id: loanId,
        status: 'aprovado',
        fundsStatus: 'bloqueado',
        guaranteeStatus: { in: ['pending', 'submitted'] },
      },
      data: {
        fundsStatus: 'disponivel',
        guaranteeStatus: 'approved',
      },
    });

    if (updated.count !== 1) {
      throw new LoanDecisionError(
        'LOAN_FUNDS_ALREADY_RELEASED',
        'Crédito já liberado ou estado inválido',
        400
      );
    }

    await prismaTx.user.update({
      where: { id: loan.userId },
      data: {
        saldoAtual: { increment: principal },
        saldoBloqueado: { decrement: principal },
      },
    });

    const saldoFinal = saldoAntes + principal;

    await prismaTx.movimentacao.create({
      data: {
        userId: loan.userId,
        tipo: 'credito',
        descricao: 'Liberação do crédito do empréstimo após garantia aprovada',
        valor: principal,
        saldoAnterior: saldoAntes,
        saldoAtual: saldoFinal,
        categoria: 'emprestimo_desbloqueio',
        referenceType: 'emprestimo',
        referenceId: loanId,
      },
    });

    logger.logCriticalOperation('loan_guarantee_released', actorId || 'internal-admin', principal, {
      emprestimoId: loanId,
      loanOwnerId: loan.userId,
      actorMeta,
    });

    await recordAudit({
      userId: actorId || null,
      action: 'loan_guarantee_released',
      entity: 'emprestimo',
      entityId: loanId,
      metadata: {
        actorMeta,
        loanOwnerId: loan.userId,
        valorLiberado: principal,
      },
    });

    return prismaTx.emprestimo.findUnique({
      where: { id: loanId },
      select: loanPublicSelect,
    });
  });
}

async function rejectLoanDecision({ loanId, actorId, actorMeta = {} }) {
  const emprestimo = await prisma.emprestimo.findUnique({ where: { id: loanId } });

  if (!emprestimo) {
    throw new LoanDecisionError('LOAN_NOT_FOUND', 'Empréstimo não encontrado', 404);
  }

  if (emprestimo.status !== 'pendente') {
    throw new LoanDecisionError('LOAN_ALREADY_DECIDED', 'Empréstimo já foi processado', 400);
  }

  const updateResult = await prisma.emprestimo.updateMany({
    where: { id: loanId, status: 'pendente' },
    data: { status: 'rejeitado' },
  });

  if (updateResult.count !== 1) {
    throw new LoanDecisionError('LOAN_ALREADY_DECIDED', 'Empréstimo já foi processado', 400);
  }

  const emprestimoAtualizado = await prisma.emprestimo.findUnique({
    where: { id: loanId },
    select: loanPublicSelect,
  });

  logger.banking('loan_rejected', actorId || 'internal-admin', {
    emprestimoId: loanId,
    valorSolicitado: emprestimo.valorSolicitado,
    actorMeta,
  });

  await recordAudit({
    userId: actorId || null,
    action: 'loan_rejected',
    entity: 'emprestimo',
    entityId: loanId,
    metadata: {
      actorMeta,
      loanOwnerId: emprestimo.userId,
      valorSolicitado: emprestimo.valorSolicitado,
      previousStatus: 'pendente',
      currentStatus: 'rejeitado',
    },
  });

  return emprestimoAtualizado;
}

module.exports = {
  LoanDecisionError,
  LOAN_INSURANCE_FEE_BRL,
  listLoansByStatus,
  listLoansByStatusWithBorrower,
  getLoanById,
  getLoanByIdWithBorrower,
  approveLoanDecision,
  createPersonalLoanAutoApproved,
  rejectLoanDecision,
  payLoanInsuranceCharge,
  releaseLoanFundsAfterGuaranteeApproved,
};
