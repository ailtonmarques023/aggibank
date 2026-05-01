const express = require('express');
const { authenticateToken, requireVerification } = require('../middleware/auth');
const { prisma } = require('../config/database');
const logger = require('../utils/logger');

const router = express.Router();

// Aplicar autenticação em todas as rotas
router.use(authenticateToken);
router.use(requireVerification);

/**
 * @swagger
 * /api/payments:
 *   get:
 *     summary: Listar pagamentos do usuário
 *     tags: [Pagamentos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Número da página
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *         description: Limite de itens por página
 *       - in: query
 *         name: tipo
 *         schema:
 *           type: string
 *           enum: [pix, boleto, cartao]
 *         description: Filtrar por tipo de pagamento
 *     responses:
 *       200:
 *         description: Pagamentos listados com sucesso
 */
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const { tipo } = req.query;
    const skip = (page - 1) * limit;

    const where = { userId: req.user.id };
    if (tipo) {
      where.tipo = tipo;
    }

    const [pagamentos, total] = await Promise.all([
      prisma.pagamento.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          valor: true,
          tipo: true,
          status: true,
          chavePix: true,
          codigoBarras: true,
          dataPagamento: true,
          createdAt: true
        }
      }),
      prisma.pagamento.count({ where })
    ]);

    res.json({
      success: true,
      message: 'Pagamentos listados com sucesso',
      data: {
        pagamentos,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    logger.error('Erro ao listar pagamentos:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * @swagger
 * /api/payments/pix:
 *   post:
 *     summary: Criar pagamento PIX
 *     tags: [Pagamentos]
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
 *               - chavePix
 *             properties:
 *               valor:
 *                 type: number
 *               chavePix:
 *                 type: string
 *               descricao:
 *                 type: string
 *     responses:
 *       201:
 *         description: Pagamento PIX criado com sucesso
 */
router.post('/pix', async (req, res) => {
  try {
    const { valor, chavePix, descricao } = req.body;

    if (!valor || !chavePix) {
      return res.status(400).json({
        success: false,
        message: 'Valor e chave PIX são obrigatórios',
        code: 'MISSING_PARAMETERS'
      });
    }

    if (valor <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valor deve ser maior que zero',
        code: 'INVALID_VALUE'
      });
    }

    // Verificar saldo disponível
    if (req.user.saldoAtual < valor) {
      return res.status(400).json({
        success: false,
        message: 'Saldo insuficiente',
        code: 'INSUFFICIENT_BALANCE'
      });
    }

    const pagamento = await prisma.pagamento.create({
      data: {
        userId: req.user.id,
        valor,
        tipo: 'pix',
        chavePix,
        status: 'pendente'
      }
    });

    logger.banking('pix_payment_created', req.user.id, {
      valor,
      chavePix,
      pagamentoId: pagamento.id
    });

    res.status(201).json({
      success: true,
      message: 'Pagamento PIX criado com sucesso',
      data: { pagamento }
    });

  } catch (error) {
    logger.error('Erro ao criar pagamento PIX:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * @swagger
 * /api/payments/boleto:
 *   post:
 *     summary: Criar pagamento de boleto
 *     tags: [Pagamentos]
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
 *               - codigoBarras
 *             properties:
 *               valor:
 *                 type: number
 *               codigoBarras:
 *                 type: string
 *               descricao:
 *                 type: string
 *     responses:
 *       201:
 *         description: Pagamento de boleto criado com sucesso
 */
router.post('/boleto', async (req, res) => {
  try {
    const { valor, codigoBarras, descricao } = req.body;

    if (!valor || !codigoBarras) {
      return res.status(400).json({
        success: false,
        message: 'Valor e código de barras são obrigatórios',
        code: 'MISSING_PARAMETERS'
      });
    }

    if (valor <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valor deve ser maior que zero',
        code: 'INVALID_VALUE'
      });
    }

    // Verificar saldo disponível
    if (req.user.saldoAtual < valor) {
      return res.status(400).json({
        success: false,
        message: 'Saldo insuficiente',
        code: 'INSUFFICIENT_BALANCE'
      });
    }

    const pagamento = await prisma.pagamento.create({
      data: {
        userId: req.user.id,
        valor,
        tipo: 'boleto',
        codigoBarras,
        status: 'pendente'
      }
    });

    logger.banking('boleto_payment_created', req.user.id, {
      valor,
      codigoBarras,
      pagamentoId: pagamento.id
    });

    res.status(201).json({
      success: true,
      message: 'Pagamento de boleto criado com sucesso',
      data: { pagamento }
    });

  } catch (error) {
    logger.error('Erro ao criar pagamento de boleto:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * @swagger
 * /api/payments/{id}/process:
 *   post:
 *     summary: Processar pagamento
 *     tags: [Pagamentos]
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
 *         description: Pagamento processado com sucesso
 */
router.post('/:id/process', async (req, res) => {
  try {
    const { id } = req.params;

    const pagamento = await prisma.pagamento.findFirst({
      where: {
        id,
        userId: req.user.id,
        status: 'pendente'
      }
    });

    if (!pagamento) {
      return res.status(404).json({
        success: false,
        message: 'Pagamento não encontrado ou já processado',
        code: 'PAYMENT_NOT_FOUND'
      });
    }

    // Verificar saldo novamente
    if (req.user.saldoAtual < pagamento.valor) {
      return res.status(400).json({
        success: false,
        message: 'Saldo insuficiente',
        code: 'INSUFFICIENT_BALANCE'
      });
    }

    // Processar pagamento
    const resultado = await prisma.$transaction(async (prisma) => {
      // Atualizar pagamento
      const pagamentoAtualizado = await prisma.pagamento.update({
        where: { id },
        data: {
          status: 'processado',
          dataPagamento: new Date()
        }
      });

      // Debitar valor da conta
      await prisma.user.update({
        where: { id: req.user.id },
        data: {
          saldoAtual: {
            decrement: pagamento.valor
          }
        }
      });

      // Registrar movimentação
      await prisma.movimentacao.create({
        data: {
          userId: req.user.id,
          tipo: pagamento.tipo,
          descricao: `Pagamento via ${pagamento.tipo.toUpperCase()}`,
          valor: -pagamento.valor,
          saldoAnterior: req.user.saldoAtual,
          saldoAtual: req.user.saldoAtual - pagamento.valor,
          categoria: 'pagamento'
        }
      });

      return pagamentoAtualizado;
    });

    logger.banking('payment_processed', req.user.id, {
      valor: pagamento.valor,
      tipo: pagamento.tipo,
      pagamentoId: id
    });

    res.json({
      success: true,
      message: 'Pagamento processado com sucesso',
      data: { pagamento: resultado }
    });

  } catch (error) {
    logger.error('Erro ao processar pagamento:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * @swagger
 * /api/payments/{id}:
 *   get:
 *     summary: Obter detalhes do pagamento
 *     tags: [Pagamentos]
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
 *         description: Detalhes do pagamento obtidos com sucesso
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const pagamento = await prisma.pagamento.findFirst({
      where: {
        id,
        userId: req.user.id
      }
    });

    if (!pagamento) {
      return res.status(404).json({
        success: false,
        message: 'Pagamento não encontrado',
        code: 'PAYMENT_NOT_FOUND'
      });
    }

    res.json({
      success: true,
      message: 'Detalhes do pagamento obtidos com sucesso',
      data: { pagamento }
    });

  } catch (error) {
    logger.error('Erro ao obter detalhes do pagamento:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * @swagger
 * /api/payments/{id}/cancel:
 *   post:
 *     summary: Cancelar pagamento
 *     tags: [Pagamentos]
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
 *         description: Pagamento cancelado com sucesso
 */
router.post('/:id/cancel', async (req, res) => {
  try {
    const { id } = req.params;

    const pagamento = await prisma.pagamento.findFirst({
      where: {
        id,
        userId: req.user.id,
        status: 'pendente'
      }
    });

    if (!pagamento) {
      return res.status(404).json({
        success: false,
        message: 'Pagamento não encontrado ou já processado',
        code: 'PAYMENT_NOT_FOUND'
      });
    }

    const pagamentoAtualizado = await prisma.pagamento.update({
      where: { id },
      data: { status: 'cancelado' }
    });

    logger.banking('payment_cancelled', req.user.id, {
      pagamentoId: id,
      valor: pagamento.valor,
      tipo: pagamento.tipo
    });

    res.json({
      success: true,
      message: 'Pagamento cancelado com sucesso',
      data: { pagamento: pagamentoAtualizado }
    });

  } catch (error) {
    logger.error('Erro ao cancelar pagamento:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

module.exports = router;
