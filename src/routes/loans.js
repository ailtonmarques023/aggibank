const express = require('express');
const {
  authenticateToken,
  requireVerification,
  requireInternalApiKey,
  logCriticalOperation
} = require('../middleware/auth');
const { validateLoanRequest } = require('../middleware/validation');
const { prisma, transaction } = require('../config/database');
const logger = require('../utils/logger');

const router = express.Router();
const LOAN_NOT_ELIGIBLE_MESSAGE = 'No momento, você ainda não está elegível para solicitar crédito pessoal.';

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
    const eligibility = getLoanEligibility(req.user.scoreCredito);

    if (!eligibility.isElegivel) {
      return res.status(403).json({
        success: false,
        error: 'LOAN_NOT_ELIGIBLE',
        code: 'LOAN_NOT_ELIGIBLE',
        message: LOAN_NOT_ELIGIBLE_MESSAGE
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
    const taxaJuros = calculateInterestRate(req.user.scoreCredito);
    
    // Calcular valor da parcela
    const valorParcela = calculateMonthlyPayment(valorSolicitado, taxaJuros, prazoMeses);

    const emprestimo = await prisma.emprestimo.create({
      data: {
        userId: req.user.id,
        valorSolicitado,
        prazoMeses,
        taxaJuros,
        valorParcela,
        status: 'pendente'
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
    const { valorAprovado } = req.body;

    const emprestimo = await prisma.emprestimo.findFirst({
      where: {
        id,
        status: 'pendente'
      }
    });

    if (!emprestimo) {
      return res.status(404).json({
        success: false,
        message: 'Empréstimo não encontrado ou já processado',
        code: 'LOAN_NOT_FOUND'
      });
    }

    const valorCredito = valorAprovado === undefined || valorAprovado === null
      ? Number(emprestimo.valorSolicitado)
      : Number(valorAprovado);

    if (!Number.isFinite(valorCredito) || valorCredito <= 0) {
      return res.status(400).json({
        success: false,
        message: 'valorAprovado deve ser um número positivo',
        code: 'INVALID_APPROVAL_VALUE'
      });
    }

    // Executar transação para aprovar empréstimo
    const resultado = await transaction(async (prisma) => {
      const contaDono = await prisma.user.findUnique({
        where: { id: emprestimo.userId },
        select: { saldoAtual: true }
      });

      if (!contaDono) {
        throw new Error('LOAN_OWNER_NOT_FOUND');
      }

      // Atualizar empréstimo
      const emprestimoAtualizado = await prisma.emprestimo.update({
        where: { id },
        data: {
          status: 'aprovado',
          valorAprovado: valorCredito,
          dataAprovacao: new Date()
        }
      });

      const saldoAnterior = Number(contaDono.saldoAtual);
      const saldoAtual = saldoAnterior + valorCredito;

      // Creditar valor na conta dona do empréstimo
      await prisma.user.update({
        where: { id: emprestimo.userId },
        data: {
          saldoAtual: {
            increment: valorCredito
          }
        }
      });

      // Registrar movimentação
      await prisma.movimentacao.create({
        data: {
          userId: emprestimo.userId,
          tipo: 'credito',
          descricao: 'Empréstimo aprovado',
          valor: valorCredito,
          saldoAnterior,
          saldoAtual,
          categoria: 'emprestimo'
        }
      });

      return emprestimoAtualizado;
    });

    logger.criticalOperation('loan_approved', req.user.id, valorCredito, {
      emprestimoId: id,
      loanOwnerId: emprestimo.userId,
      prazoMeses: emprestimo.prazoMeses
    });

    res.json({
      success: true,
      message: 'Empréstimo aprovado com sucesso',
      data: { emprestimo: resultado }
    });

  } catch (error) {
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
router.post('/:id/reject', requireInternalApiKey('LOAN_DECISION_INTERNAL_KEY'), async (req, res) => {
  try {
    const { id } = req.params;

    const emprestimo = await prisma.emprestimo.findFirst({
      where: {
        id,
        status: 'pendente'
      }
    });

    if (!emprestimo) {
      return res.status(404).json({
        success: false,
        message: 'Empréstimo não encontrado ou já processado',
        code: 'LOAN_NOT_FOUND'
      });
    }

    const emprestimoAtualizado = await prisma.emprestimo.update({
      where: { id },
      data: { status: 'rejeitado' }
    });

    logger.banking('loan_rejected', req.user.id, {
      emprestimoId: id,
      valorSolicitado: emprestimo.valorSolicitado
    });

    res.json({
      success: true,
      message: 'Empréstimo rejeitado',
      data: { emprestimo: emprestimoAtualizado }
    });

  } catch (error) {
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

    if (!valor || !prazoMeses) {
      return res.status(400).json({
        success: false,
        message: 'Valor e prazo são obrigatórios',
        code: 'MISSING_PARAMETERS'
      });
    }

    const taxaJuros = calculateInterestRate(req.user.scoreCredito);
    const valorParcela = calculateMonthlyPayment(valor, taxaJuros, prazoMeses);
    const valorTotal = valorParcela * prazoMeses;
    const valorJuros = valorTotal - valor;

    res.json({
      success: true,
      message: 'Simulação realizada com sucesso',
      data: {
        valorSolicitado: valor,
        prazoMeses,
        taxaJuros,
        valorParcela,
        valorTotal,
        valorJuros,
        scoreCredito: req.user.scoreCredito
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
    const eligibility = getLoanEligibility(req.user.scoreCredito);

    res.json({
      success: true,
      message: 'Elegibilidade verificada com sucesso',
      data: {
        isElegivel: eligibility.isElegivel,
        scoreCredito: eligibility.scoreCredito,
        limiteMaximo: eligibility.limiteMaximo,
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

function getLoanEligibility(scoreCredito) {
  const normalizedScore = Number(scoreCredito) || 0;

  return {
    isElegivel: normalizedScore >= 600,
    scoreCredito: normalizedScore,
    limiteMaximo: calculateMaxLoanAmount(normalizedScore),
    taxaJuros: calculateInterestRate(normalizedScore)
  };
}

module.exports = router;
