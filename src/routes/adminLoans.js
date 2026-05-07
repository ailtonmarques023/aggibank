const express = require('express');
const logger = require('../utils/logger');
const {
  LoanDecisionError,
  listLoansByStatus,
  getLoanById,
  approveLoanDecision,
  rejectLoanDecision,
} = require('../services/loanDecisionService');

const router = express.Router();
const ADMIN_KEY_ENV = 'ADMIN_API_KEY';
const LEGACY_FALLBACK_ENV = 'LOAN_DECISION_INTERNAL_KEY';

function requireAdminLoanKey(req, res, next) {
  const adminExpected = process.env[ADMIN_KEY_ENV];
  const legacyExpected = process.env[LEGACY_FALLBACK_ENV];
  const expected = adminExpected || legacyExpected;

  if (!expected) {
    return res.status(503).json({
      success: false,
      message: 'Operação interna indisponível no momento',
      code: 'INTERNAL_OPERATION_UNAVAILABLE',
    });
  }

  if (!adminExpected && legacyExpected) {
    logger.warn('admin_loan_key_fallback_enabled', {
      category: 'security_event',
      component: 'admin_loans',
      fallbackEnv: LEGACY_FALLBACK_ENV,
    });
  }

  const provided = req.get('x-internal-key');
  if (!provided || provided !== expected) {
    return res.status(403).json({
      success: false,
      message: 'Acesso negado',
      code: 'ACCESS_DENIED',
    });
  }

  return next();
}

function resolveActorMeta(req) {
  return {
    source: 'admin_api',
    requestId: req.requestId || null,
    ip: req.ip || null,
    userAgent: req.get('User-Agent') || null,
  };
}

function handleLoanDecisionError(error, res) {
  if (error instanceof LoanDecisionError) {
    return res.status(error.status).json({
      success: false,
      message: error.message,
      code: error.code,
    });
  }

  logger.error('Erro em operação admin de empréstimos:', error);
  return res.status(500).json({
    success: false,
    message: 'Erro interno do servidor',
    code: 'INTERNAL_ERROR',
  });
}

router.use(requireAdminLoanKey);

router.get('/', async (req, res) => {
  try {
    const status = String(req.query.status || 'pendente').trim();
    const emprestimos = await listLoansByStatus(status);

    return res.json({
      success: true,
      message: 'Empréstimos listados com sucesso',
      data: { emprestimos },
    });
  } catch (error) {
    return handleLoanDecisionError(error, res);
  }
});

router.get('/:id', async (req, res) => {
  try {
    const emprestimo = await getLoanById(req.params.id);
    if (!emprestimo) {
      return res.status(404).json({
        success: false,
        message: 'Empréstimo não encontrado',
        code: 'LOAN_NOT_FOUND',
      });
    }

    return res.json({
      success: true,
      message: 'Empréstimo encontrado',
      data: { emprestimo },
    });
  } catch (error) {
    return handleLoanDecisionError(error, res);
  }
});

router.post('/:id/approve', async (req, res) => {
  try {
    const emprestimo = await approveLoanDecision({
      loanId: req.params.id,
      valorAprovado: req.body && req.body.valorAprovado,
      actorId: null,
      actorMeta: resolveActorMeta(req),
    });

    return res.json({
      success: true,
      message: 'Empréstimo aprovado com sucesso',
      data: { emprestimo },
    });
  } catch (error) {
    return handleLoanDecisionError(error, res);
  }
});

router.post('/:id/reject', async (req, res) => {
  try {
    const emprestimo = await rejectLoanDecision({
      loanId: req.params.id,
      actorId: null,
      actorMeta: resolveActorMeta(req),
    });

    return res.json({
      success: true,
      message: 'Empréstimo rejeitado',
      data: { emprestimo },
    });
  } catch (error) {
    return handleLoanDecisionError(error, res);
  }
});

module.exports = router;
