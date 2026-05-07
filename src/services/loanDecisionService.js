const { prisma, transaction } = require('../config/database');
const logger = require('../utils/logger');
const { recordAudit } = require('../utils/auditLog');

class LoanDecisionError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function normalizeApprovalValue(inputValue, requestedValue) {
  const value = requestedValue === undefined || requestedValue === null
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

async function listLoansByStatus(status = 'pendente') {
  return prisma.emprestimo.findMany({
    where: { status },
    orderBy: { dataSolicitacao: 'asc' },
    select: {
      id: true,
      userId: true,
      valorSolicitado: true,
      valorAprovado: true,
      prazoMeses: true,
      taxaJuros: true,
      valorParcela: true,
      status: true,
      dataSolicitacao: true,
      dataAprovacao: true,
      dataQuitacao: true,
    },
  });
}

async function getLoanById(id) {
  return prisma.emprestimo.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      valorSolicitado: true,
      valorAprovado: true,
      prazoMeses: true,
      taxaJuros: true,
      valorParcela: true,
      status: true,
      dataSolicitacao: true,
      dataAprovacao: true,
      dataQuitacao: true,
    },
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

  const valorCredito = normalizeApprovalValue(emprestimo.valorSolicitado, valorAprovado);

  const resultado = await transaction(async (prismaTx) => {
    const contaDono = await prismaTx.user.findUnique({
      where: { id: emprestimo.userId },
      select: { saldoAtual: true },
    });

    if (!contaDono) {
      throw new LoanDecisionError('LOAN_OWNER_NOT_FOUND', 'Titular do empréstimo não encontrado', 404);
    }

    const updateResult = await prismaTx.emprestimo.updateMany({
      where: { id: loanId, status: 'pendente' },
      data: {
        status: 'aprovado',
        valorAprovado: valorCredito,
        dataAprovacao: new Date(),
      },
    });

    if (updateResult.count !== 1) {
      throw new LoanDecisionError('LOAN_ALREADY_DECIDED', 'Empréstimo já foi processado', 400);
    }

    const saldoAnterior = Number(contaDono.saldoAtual);
    const saldoAtual = saldoAnterior + valorCredito;

    await prismaTx.user.update({
      where: { id: emprestimo.userId },
      data: {
        saldoAtual: {
          increment: valorCredito,
        },
      },
    });

    await prismaTx.movimentacao.create({
      data: {
        userId: emprestimo.userId,
        tipo: 'credito',
        descricao: 'Empréstimo aprovado',
        valor: valorCredito,
        saldoAnterior,
        saldoAtual,
        categoria: 'emprestimo',
      },
    });

    return prismaTx.emprestimo.findUnique({ where: { id: loanId } });
  });

  logger.logCriticalOperation('loan_approved', actorId || 'internal-admin', valorCredito, {
    emprestimoId: loanId,
    loanOwnerId: emprestimo.userId,
    prazoMeses: emprestimo.prazoMeses,
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
    },
  });

  return resultado;
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

  const emprestimoAtualizado = await prisma.emprestimo.findUnique({ where: { id: loanId } });

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
  listLoansByStatus,
  getLoanById,
  approveLoanDecision,
  rejectLoanDecision,
};
