const express = require('express');
const { authenticateToken, requireVerification, logCriticalOperation } = require('../middleware/auth');
const { validatePixTransaction } = require('../middleware/validation');
const { prisma, transaction } = require('../config/database');
const logger = require('../utils/logger');
const { sendTransactionNotification } = require('../utils/email');
const { registrarDebitoSaldoAtual, LedgerError } = require('../services/ledgerService');

const router = express.Router();

function getIdempotencyKey(req) {
  const rawKey = req.get('Idempotency-Key') || req.body?.idempotencyKey;
  if (!rawKey) return null;

  const key = String(rawKey).trim();
  if (!key) return null;

  return key.slice(0, 120);
}

function isUniqueConstraintError(error) {
  return error && error.code === 'P2002';
}

function isValidIdempotencyKey(key) {
  return /^[a-zA-Z0-9._:-]{8,120}$/.test(key);
}

async function findPixByIdempotencyKey(idempotencyKey) {
  if (!idempotencyKey) return null;

  return prisma.transacaoPix.findUnique({
    where: { idempotencyKey }
  });
}

function sendIdempotentPixResponse(res, transacao) {
  return res.json({
    success: true,
    message: 'PIX enviado com sucesso',
    data: {
      transacao,
      idempotent: true
    }
  });
}

// Aplicar autenticação em todas as rotas
router.use(authenticateToken);
router.use(requireVerification);

/**
 * @swagger
 * /api/pix/keys:
 *   get:
 *     summary: Listar chaves PIX do usuário
 *     tags: [PIX]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Chaves PIX listadas com sucesso
 */
router.get('/keys', async (req, res) => {
  try {
    const chavesPix = await prisma.chavePix.findMany({
      where: { userId: req.user.id },
      select: {
        id: true,
        tipo: true,
        valor: true,
        status: true,
        dataCriacao: true,
        dataAtivacao: true
      }
    });

    res.json({
      success: true,
      message: 'Chaves PIX listadas com sucesso',
      data: { chavesPix }
    });

  } catch (error) {
    logger.error('Erro ao listar chaves PIX:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * @swagger
 * /api/pix/keys:
 *   post:
 *     summary: Cadastrar nova chave PIX
 *     tags: [PIX]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - tipo
 *               - valor
 *             properties:
 *               tipo:
 *                 type: string
 *                 enum: [cpf, email, telefone, aleatoria]
 *               valor:
 *                 type: string
 *     responses:
 *       201:
 *         description: Chave PIX cadastrada com sucesso
 */
router.post('/keys', async (req, res) => {
  try {
    const { tipo, valor } = req.body;

    // Validar se o valor corresponde ao tipo
    if (tipo === 'cpf' && !/^\d{11}$/.test(valor)) {
      return res.status(400).json({
        success: false,
        message: 'CPF deve conter exatamente 11 dígitos',
        code: 'INVALID_CPF'
      });
    }

    if (tipo === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor)) {
      return res.status(400).json({
        success: false,
        message: 'Email inválido',
        code: 'INVALID_EMAIL'
      });
    }

    if (tipo === 'telefone' && !/^\(\d{2}\)\s\d{4,5}-\d{4}$/.test(valor)) {
      return res.status(400).json({
        success: false,
        message: 'Telefone deve estar no formato (XX) XXXXX-XXXX',
        code: 'INVALID_PHONE'
      });
    }

    // Verificar se chave já existe
    const chaveExistente = await prisma.chavePix.findUnique({
      where: { valor }
    });

    if (chaveExistente) {
      return res.status(400).json({
        success: false,
        message: 'Chave PIX já está em uso',
        code: 'KEY_ALREADY_EXISTS'
      });
    }

    // Verificar limite de chaves por usuário (máximo 5)
    const chavesUsuario = await prisma.chavePix.count({
      where: { userId: req.user.id }
    });

    if (chavesUsuario >= 5) {
      return res.status(400).json({
        success: false,
        message: 'Limite máximo de 5 chaves PIX atingido',
        code: 'KEY_LIMIT_EXCEEDED'
      });
    }

    const chavePix = await prisma.chavePix.create({
      data: {
        userId: req.user.id,
        tipo,
        valor,
        status: 'pendente'
      }
    });

    logger.banking('pix_key_created', req.user.id, { tipo, valor });

    res.status(201).json({
      success: true,
      message: 'Chave PIX cadastrada com sucesso',
      data: { chavePix }
    });

  } catch (error) {
    logger.error('Erro ao cadastrar chave PIX:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * @swagger
 * /api/pix/send:
 *   post:
 *     summary: Enviar PIX
 *     tags: [PIX]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PIXTransaction'
 *     responses:
 *       200:
 *         description: PIX enviado com sucesso
 */
router.post('/send', validatePixTransaction, logCriticalOperation('pix_send'), async (req, res) => {
  try {
    const { chavePix, valor, descricao } = req.body;
    const idempotencyKey = getIdempotencyKey(req);

    if (idempotencyKey && !isValidIdempotencyKey(idempotencyKey)) {
      return res.status(400).json({
        success: false,
        message: 'Chave de idempotência inválida',
        code: 'INVALID_IDEMPOTENCY_KEY'
      });
    }

    const transacaoExistente = await findPixByIdempotencyKey(idempotencyKey);
    if (transacaoExistente) {
      if (transacaoExistente.userId !== req.user.id) {
        return res.status(409).json({
          success: false,
          message: 'Chave de idempotência já utilizada',
          code: 'IDEMPOTENCY_KEY_CONFLICT'
        });
      }

      return sendIdempotentPixResponse(res, transacaoExistente);
    }

    // Verificar saldo disponível
    if (req.user.saldoAtual < valor) {
      return res.status(400).json({
        success: false,
        message: 'Saldo insuficiente',
        code: 'INSUFFICIENT_BALANCE'
      });
    }

    // Verificar limite diário
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    
    const pixHoje = await prisma.transacaoPix.aggregate({
      where: {
        userId: req.user.id,
        tipo: 'envio',
        dataTransacao: {
          gte: hoje
        },
        status: 'processada'
      },
      _sum: {
        valor: true
      }
    });

    const totalHoje = pixHoje._sum.valor || 0;
    if (totalHoje + valor > req.user.limitePixDiario) {
      return res.status(400).json({
        success: false,
        message: 'Limite diário de PIX excedido',
        code: 'DAILY_LIMIT_EXCEEDED'
      });
    }

    // Executar transação (débito + Movimentacao via ledger)
    const resultado = await transaction(async (prismaTx) => {
      const transacaoPix = await prismaTx.transacaoPix.create({
        data: {
          userId: req.user.id,
          chavePix,
          valor,
          descricao,
          tipo: 'envio',
          status: 'processada',
          idempotencyKey,
        },
      });

      await registrarDebitoSaldoAtual(prismaTx, {
        userId: req.user.id,
        valorDebito: valor,
        tipo: 'pix',
        descricao: `PIX enviado para ${chavePix}`,
        categoria: 'transferencia',
        referenceType: 'pix',
        referenceId: transacaoPix.id,
        idempotencyKey,
      });

      return transacaoPix;
    });

    // Enviar notificação por email
    try {
      await sendTransactionNotification(
        { nome: req.user.nomeCompleto, email: req.user.email },
        {
          tipo: 'PIX enviado',
          valor: valor.toFixed(2),
          descricao,
          dataTransacao: resultado.dataTransacao,
          status: resultado.status,
          remetente: req.user.nomeCompleto,
          destinatario: chavePix,
        }
      );
    } catch (emailError) {
      logger.warn('Erro ao enviar notificação de PIX:', emailError);
    }

    logger.criticalOperation('pix_send', req.user.id, valor, {
      chavePix,
      descricao
    });

    res.json({
      success: true,
      message: 'PIX enviado com sucesso',
      data: { transacao: resultado }
    });

  } catch (error) {
    if (error instanceof LedgerError) {
      return res.status(error.httpStatus).json({
        success: false,
        message: error.message,
        code: error.code,
      });
    }
    if (isUniqueConstraintError(error)) {
      try {
        const idempotencyKey = getIdempotencyKey(req);
        const transacaoExistente = await findPixByIdempotencyKey(idempotencyKey);

        if (transacaoExistente && transacaoExistente.userId === req.user.id) {
          return sendIdempotentPixResponse(res, transacaoExistente);
        }
      } catch (lookupError) {
        logger.error('Erro ao recuperar PIX idempotente:', lookupError);
      }
    }

    logger.error('Erro ao enviar PIX:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * @swagger
 * /api/pix/transactions:
 *   get:
 *     summary: Listar transações PIX
 *     tags: [PIX]
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
 *     responses:
 *       200:
 *         description: Transações listadas com sucesso
 */
router.get('/transactions', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const [transacoes, total] = await Promise.all([
      prisma.transacaoPix.findMany({
        where: { userId: req.user.id },
        orderBy: { dataTransacao: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          chavePix: true,
          valor: true,
          descricao: true,
          status: true,
          tipo: true,
          dataTransacao: true
        }
      }),
      prisma.transacaoPix.count({
        where: { userId: req.user.id }
      })
    ]);

    res.json({
      success: true,
      message: 'Transações listadas com sucesso',
      data: {
        transacoes,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    logger.error('Erro ao listar transações PIX:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * @swagger
 * /api/pix/limits:
 *   get:
 *     summary: Obter limites PIX
 *     tags: [PIX]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Limites obtidos com sucesso
 */
router.get('/limits', async (req, res) => {
  try {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const [pixHoje, pixMes] = await Promise.all([
      prisma.transacaoPix.aggregate({
        where: {
          userId: req.user.id,
          tipo: 'envio',
          dataTransacao: { gte: hoje },
          status: 'processada'
        },
        _sum: { valor: true }
      }),
      prisma.transacaoPix.aggregate({
        where: {
          userId: req.user.id,
          tipo: 'envio',
          dataTransacao: { 
            gte: new Date(hoje.getFullYear(), hoje.getMonth(), 1)
          },
          status: 'processada'
        },
        _sum: { valor: true }
      })
    ]);

    res.json({
      success: true,
      message: 'Limites obtidos com sucesso',
      data: {
        limiteDiario: req.user.limitePixDiario,
        limiteMensal: req.user.limitePixMensal,
        usadoHoje: pixHoje._sum.valor || 0,
        usadoMes: pixMes._sum.valor || 0,
        restanteHoje: req.user.limitePixDiario - (pixHoje._sum.valor || 0),
        restanteMes: req.user.limitePixMensal - (pixMes._sum.valor || 0)
      }
    });

  } catch (error) {
    logger.error('Erro ao obter limites PIX:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

module.exports = router;
