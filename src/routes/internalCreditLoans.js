const express = require('express');
const logger = require('../utils/logger');
const {
  authenticateToken,
  requireVerification,
  requireCreditPanelOperator,
} = require('../middleware/auth');
const {
  LoanDecisionError,
  listLoansByStatusWithBorrower,
  getLoanByIdWithBorrower,
  approveLoanDecision,
  rejectLoanDecision,
} = require('../services/loanDecisionService');

const router = express.Router();

function resolveActorMeta(req) {
  return {
    source: 'credit_panel_bff',
    operatorId: req.user.id,
    operatorEmail: req.user.email,
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

  logger.error('Erro no BFF de crédito (painel interno):', error);
  return res.status(500).json({
    success: false,
    message: 'Erro interno do servidor',
    code: 'INTERNAL_ERROR',
  });
}

router.use(authenticateToken);
router.use(requireVerification);
router.use(requireCreditPanelOperator);

router.get('/', async (req, res) => {
  try {
    const status = String(req.query.status || 'pendente').trim();
    const loans = await listLoansByStatusWithBorrower(status);
    return res.json({
      success: true,
      message: 'Propostas listadas',
      data: { loans },
    });
  } catch (error) {
    return handleLoanDecisionError(error, res);
  }
});

router.get('/:id', async (req, res) => {
  try {
    const loan = await getLoanByIdWithBorrower(req.params.id);
    if (!loan) {
      return res.status(404).json({
        success: false,
        message: 'Empréstimo não encontrado',
        code: 'LOAN_NOT_FOUND',
      });
    }
    return res.json({
      success: true,
      message: 'Proposta encontrada',
      data: { loan },
    });
  } catch (error) {
    return handleLoanDecisionError(error, res);
  }
});

router.post('/:id/approve', async (req, res) => {
  try {
    const loan = await approveLoanDecision({
      loanId: req.params.id,
      valorAprovado: req.body && req.body.valorAprovado,
      actorId: req.user.id,
      actorMeta: resolveActorMeta(req),
    });

    return res.json({
      success: true,
      message: 'Empréstimo aprovado com sucesso',
      data: { loan },
    });
  } catch (error) {
    return handleLoanDecisionError(error, res);
  }
});

router.post('/:id/reject', async (req, res) => {
  try {
    const loan = await rejectLoanDecision({
      loanId: req.params.id,
      actorId: req.user.id,
      actorMeta: resolveActorMeta(req),
    });

    return res.json({
      success: true,
      message: 'Empréstimo rejeitado',
      data: { loan },
    });
  } catch (error) {
    return handleLoanDecisionError(error, res);
  }
});

module.exports = router;
