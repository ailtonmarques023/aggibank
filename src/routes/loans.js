const express = require('express');
const {
  authenticateToken,
  requireVerification,
  requireInternalApiKey,
  logCriticalOperation
} = require('../middleware/auth');
const { validateLoanRequest } = require('../middleware/validation');
const { prisma } = require('../config/database');
const logger = require('../utils/logger');
const {
  LoanDecisionError,
  approveLoanDecision,
  rejectLoanDecision,
  payLoanInsuranceCharge,
  releaseLoanFundsAfterGuaranteeApproved,
  LOAN_INSURANCE_FEE_BRL,
} = require('../services/loanDecisionService');

const router = express.Router();
const LOAN_NOT_ELIGIBLE_MESSAGE =
  'No momento, sua renda informada ainda não permite solicitar crédito pessoal.';
const LOAN_AMOUNT_ABOVE_LIMIT_MESSAGE =
  'O valor solicitado ultrapassa o limite disponível para sua conta.';
const LOAN_TERM_ABOVE_LIMIT_MESSAGE =
  'O prazo solicitado ultrapassa o máximo permitido.';
const MIN_ELIGIBLE_MONTHLY_INCOME = 1000;
const INCOME_LIMIT_MULTIPLIER = 4;
const MAX_LOAN_TERM_MONTHS = 72;

// Aplicar autenticação em todas as rotas
router.use(authenticateToken);
router.use(requireVerification);

/**
 * @swagger
 * /api/loans:
 *   get:
 *     summary: Listar empréstimos do usuário
 *     tags: [Empréstimos]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Empréstimos listados com sucesso
 */
router.get('/', async (req, res) => {
  try {
    const emprestimos = await prisma.emprestimo.findMany({
      where: { userId: req.user.id },
      orderBy: { dataSolicitacao: 'desc' },
      select: {
        id: true,
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
        dataQuitacao: true
      }
    });

    res.json({
      success: true,
      message: 'Empréstimos listados com sucesso',
      data: { emprestimos }
    });

  } catch (error) {
    logger.error('Erro ao listar empréstimos:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * @swagger
 * /api/loans:
 *   post:
 *     summary: Solicitar empréstimo
 *     tags: [Empréstimos]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Loan'
 *     responses:
 *       201:
 *         description: Empréstimo solicitado com sucesso
 */
router.post('/', validateLoanRequest, logCriticalOperation('loan_request'), async (req, res) => {
  try {
    const { valorSolicitado, prazoMeses } = req.body;
    const insuranceSelected = req.body.insuranceSelected === true;
    const insuranceTermsAccepted = req.body.insuranceTermsAccepted === true;
    const eligibility = await getLoanEligibilityByIncome(req.user.id, req.user.scoreCredito);
    const valorSolicitadoNumber = Number(valorSolicitado);
    const prazoMesesNumber = Number(prazoMeses);

    if (!eligibility.isElegivel) {
      return res.status(403).json({
        success: false,
        error: 'LOAN_NOT_ELIGIBLE',
        code: 'LOAN_NOT_ELIGIBLE',
        message: LOAN_NOT_ELIGIBLE_MESSAGE
      });
    }

    if (valorSolicitadoNumber > eligibility.limiteMaximo) {
      return res.status(400).json({
        success: false,
        error: 'LOAN_AMOUNT_ABOVE_LIMIT',
        code: 'LOAN_AMOUNT_ABOVE_LIMIT',
        message: LOAN_AMOUNT_ABOVE_LIMIT_MESSAGE
      });
    }

    if (prazoMesesNumber > eligibility.prazoMaximo) {
      return res.status(400).json({
        success: false,
        error: 'LOAN_TERM_ABOVE_LIMIT',
        code: 'LOAN_TERM_ABOVE_LIMIT',
        message: LOAN_TERM_ABOVE_LIMIT_MESSAGE
      });
    }

    // Verificar se usuário já tem empréstimo pendente
    const emprestimoPendente = await prisma.emprestimo.findFirst({
      where: {
        userId: req.user.id,
        status: 'pendente'
      }
    });

    if (emprestimoPendente) {
      return res.status(400).json({
        success: false,
        message: 'Você já possui um empréstimo pendente de aprovação',
        code: 'LOAN_PENDING'
      });
    }

    // Calcular taxa de juros baseada no score de crédito
    const taxaJuros = eligibility.taxaJuros;
    
    // Calcular valor da parcela
    const valorParcela = calculateMonthlyPayment(valorSolicitadoNumber, taxaJuros, prazoMesesNumber);

    const emprestimo = await prisma.emprestimo.create({
      data: {
        userId: req.user.id,
        valorSolicitado: valorSolicitadoNumber,
        prazoMeses: prazoMesesNumber,
        taxaJuros,
        valorParcela,
        status: 'pendente',
        insuranceSelected,
        insuranceTermsAccepted,
        insuranceAmount: insuranceSelected ? LOAN_INSURANCE_FEE_BRL : null,
        guaranteeStatus: insuranceSelected ? 'not_required' : 'pending'
      }
    });

    logger.banking('loan_requested', req.user.id, {
      valorSolicitado,
      prazoMeses,
      taxaJuros,
      valorParcela
    });

    res.status(201).json({
      success: true,
      message: 'Empréstimo solicitado com sucesso',
      data: { emprestimo }
    });

  } catch (error) {
    logger.error('Erro ao solicitar empréstimo:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * @swagger
 * /api/loans/{id}/approve:
 *   post:
 *     summary: Aprovar empréstimo
 *     tags: [Empréstimos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               valorAprovado:
 *                 type: number
 *     responses:
 *       200:
 *         description: Empréstimo aprovado com sucesso
 */
router.post(
  '/:id/approve',
  requireInternalApiKey('LOAN_DECISION_INTERNAL_KEY'),
  logCriticalOperation('loan_approval'),
  async (req, res) => {
  try {
    const { id } = req.params;
    const resultado = await approveLoanDecision({
      loanId: id,
      valorAprovado: req.body && req.body.valorAprovado,
      actorId: req.user.id,
      actorMeta: {
        source: 'legacy_loans_route',
        requestId: req.requestId || null,
      },
    });

    res.json({
      success: true,
      message: 'Empréstimo aprovado com sucesso',
      data: { emprestimo: resultado }
    });

  } catch (error) {
    if (error instanceof LoanDecisionError) {
      return res.status(error.status).json({
        success: false,
        message: error.message,
        code: error.code
      });
    }

    logger.error('Erro ao aprovar empréstimo:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * @swagger
 * /api/loans/{id}/reject:
 *   post:
 *     summary: Rejeitar empréstimo
 *     tags: [Empréstimos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Empréstimo rejeitado com sucesso
 */
router.post(
  '/:id/insurance/pay',
  logCriticalOperation('loan_insurance_pay'),
  async (req, res) => {
    try {
      const emprestimo = await payLoanInsuranceCharge({
        loanId: req.params.id,
        userId: req.user.id
      });

      res.json({
        success: true,
        message: 'Seguro do empréstimo quitado e crédito liberado no saldo disponível',
        data: { emprestimo }
      });
    } catch (error) {
      if (error instanceof LoanDecisionError) {
        return res.status(error.status).json({
          success: false,
          message: error.message,
          code: error.code
        });
      }

      logger.error('Erro ao quitar seguro do empréstimo:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        code: 'INTERNAL_ERROR'
      });
    }
  }
);

router.post(
  '/:id/guarantee/approve',
  requireInternalApiKey('LOAN_DECISION_INTERNAL_KEY'),
  logCriticalOperation('loan_guarantee_release'),
  async (req, res) => {
    try {
      const emprestimo = await releaseLoanFundsAfterGuaranteeApproved({
        loanId: req.params.id,
        actorId: req.user ? req.user.id : null,
        actorMeta: {
          source: 'loans_internal_route',
          requestId: req.requestId || null
        }
      });

      res.json({
        success: true,
        message: 'Garantia aprovada e crédito liberado no saldo disponível',
        data: { emprestimo }
      });
    } catch (error) {
      if (error instanceof LoanDecisionError) {
        return res.status(error.status).json({
          success: false,
          message: error.message,
          code: error.code
        });
      }

      logger.error('Erro ao liberar crédito por garantia:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        code: 'INTERNAL_ERROR'
      });
    }
  }
);

router.post('/:id/reject', requireInternalApiKey('LOAN_DECISION_INTERNAL_KEY'), async (req, res) => {
  try {
    const { id } = req.params;
    const emprestimoAtualizado = await rejectLoanDecision({
      loanId: id,
      actorId: req.user.id,
      actorMeta: {
        source: 'legacy_loans_route',
        requestId: req.requestId || null,
      },
    });

    res.json({
      success: true,
      message: 'Empréstimo rejeitado',
      data: { emprestimo: emprestimoAtualizado }
    });

  } catch (error) {
    if (error instanceof LoanDecisionError) {
      return res.status(error.status).json({
        success: false,
        message: error.message,
        code: error.code
      });
    }

    logger.error('Erro ao rejeitar empréstimo:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * @swagger
 * /api/loans/simulate:
 *   post:
 *     summary: Simular empréstimo
 *     tags: [Empréstimos]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - valor
 *               - prazoMeses
 *             properties:
 *               valor:
 *                 type: number
 *               prazoMeses:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Simulação realizada com sucesso
 */
router.post('/simulate', async (req, res) => {
  try {
    const { valor, prazoMeses } = req.body;
    const valorNumber = Number(valor);
    const prazoMesesNumber = Number(prazoMeses);

    if (!Number.isFinite(valorNumber) || !Number.isFinite(prazoMesesNumber)) {
      return res.status(400).json({
        success: false,
        message: 'Valor e prazo são obrigatórios',
        code: 'MISSING_PARAMETERS'
      });
    }

    const eligibility = await getLoanEligibilityByIncome(req.user.id, req.user.scoreCredito);

    if (!eligibility.isElegivel) {
      return res.status(403).json({
        success: false,
        error: 'LOAN_NOT_ELIGIBLE',
        code: 'LOAN_NOT_ELIGIBLE',
        message: LOAN_NOT_ELIGIBLE_MESSAGE
      });
    }

    if (valorNumber > eligibility.limiteMaximo) {
      return res.status(400).json({
        success: false,
        error: 'LOAN_AMOUNT_ABOVE_LIMIT',
        code: 'LOAN_AMOUNT_ABOVE_LIMIT',
        message: LOAN_AMOUNT_ABOVE_LIMIT_MESSAGE
      });
    }

    if (prazoMesesNumber > eligibility.prazoMaximo) {
      return res.status(400).json({
        success: false,
        error: 'LOAN_TERM_ABOVE_LIMIT',
        code: 'LOAN_TERM_ABOVE_LIMIT',
        message: LOAN_TERM_ABOVE_LIMIT_MESSAGE
      });
    }

    const taxaJuros = eligibility.taxaJuros;
    const valorParcela = calculateMonthlyPayment(valorNumber, taxaJuros, prazoMesesNumber);
    const valorTotal = valorParcela * prazoMesesNumber;
    const valorJuros = valorTotal - valorNumber;

    res.json({
      success: true,
      message: 'Simulação realizada com sucesso',
      data: {
        valorSolicitado: valorNumber,
        prazoMeses: prazoMesesNumber,
        taxaJuros,
        valorParcela,
        valorTotal,
        valorJuros,
        scoreCredito: req.user.scoreCredito,
        limiteMaximo: eligibility.limiteMaximo,
        prazoMaximo: eligibility.prazoMaximo,
        rendaMensal: eligibility.rendaMensal
      }
    });

  } catch (error) {
    logger.error('Erro na simulação de empréstimo:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * @swagger
 * /api/loans/eligibility:
 *   get:
 *     summary: Verificar elegibilidade para empréstimo
 *     tags: [Empréstimos]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Elegibilidade verificada com sucesso
 */
router.get('/eligibility', async (req, res) => {
  try {
    const eligibility = await getLoanEligibilityByIncome(req.user.id, req.user.scoreCredito);

    res.json({
      success: true,
      message: 'Elegibilidade verificada com sucesso',
      data: {
        isElegivel: eligibility.isElegivel,
        rendaMensal: eligibility.rendaMensal,
        scoreCredito: eligibility.scoreCredito,
        limiteMaximo: eligibility.limiteMaximo,
        prazoMaximo: eligibility.prazoMaximo,
        taxaJuros: eligibility.taxaJuros
      }
    });

  } catch (error) {
    logger.error('Erro ao verificar elegibilidade:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// Funções auxiliares
function calculateInterestRate(scoreCredito) {
  if (scoreCredito >= 800) return 1.5; // 1.5% ao mês
  if (scoreCredito >= 700) return 2.0; // 2.0% ao mês
  if (scoreCredito >= 600) return 2.5; // 2.5% ao mês
  return 3.0; // 3.0% ao mês
}

function calculateMonthlyPayment(valor, taxaJuros, prazoMeses) {
  const taxaDecimal = taxaJuros / 100;
  const valorParcela = valor * (taxaDecimal * Math.pow(1 + taxaDecimal, prazoMeses)) / 
                      (Math.pow(1 + taxaDecimal, prazoMeses) - 1);
  return Math.round(valorParcela * 100) / 100;
}

function calculateMaxLoanAmount(scoreCredito) {
  if (scoreCredito >= 800) return 50000;
  if (scoreCredito >= 700) return 30000;
  if (scoreCredito >= 600) return 15000;
  return 5000;
}

function getLoanEligibilityByIncomeData(rendaMensal, scoreCredito) {
  const normalizedScore = Number(scoreCredito) || 0;
  const normalizedIncome = Number(rendaMensal) || 0;
  const isElegivel = normalizedIncome > MIN_ELIGIBLE_MONTHLY_INCOME;
  const limiteMaximo = isElegivel ? Math.round(normalizedIncome * INCOME_LIMIT_MULTIPLIER * 100) / 100 : 0;
  const prazoMaximo = isElegivel ? MAX_LOAN_TERM_MONTHS : 0;

  return {
    isElegivel,
    rendaMensal: normalizedIncome,
    scoreCredito: normalizedScore,
    limiteMaximo,
    prazoMaximo,
    taxaJuros: calculateInterestRate(normalizedScore)
  };
}

async function getLoanEligibilityByIncome(userId, scoreCredito) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      scoreCredito: true,
      dadosProfissionais: {
        select: { rendaMensal: true }
      }
    }
  });

  const persistedScore = user && user.scoreCredito != null ? user.scoreCredito : scoreCredito;
  const rendaMensal = user && user.dadosProfissionais ? user.dadosProfissionais.rendaMensal : null;
  return getLoanEligibilityByIncomeData(rendaMensal, persistedScore);
}

module.exports = router;
