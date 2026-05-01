const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { authenticateToken, requireVerification } = require('../middleware/auth');
const { validateCardRequest } = require('../middleware/validation');
const { prisma } = require('../config/database');
const logger = require('../utils/logger');
const { sendCardNotification } = require('../utils/email');
const { recordAudit } = require('../utils/auditLog');

const router = express.Router();

/** Resposta API: sem token interno demo (persistido só no banco). */
function publicCard(cartao) {
  if (!cartao) return cartao;
  const { cardToken: _omit, ...rest } = cartao;
  return rest;
}

// Aplicar autenticação em todas as rotas
router.use(authenticateToken);
router.use(requireVerification);

/**
 * @swagger
 * /api/cards:
 *   get:
 *     summary: Listar cartões do usuário
 *     tags: [Cartões]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cartões listados com sucesso
 */
router.get('/', async (req, res) => {
  try {
    const cartoes = await prisma.cartao.findMany({
      where: { userId: req.user.id },
      select: {
        id: true,
        maskedNumber: true,
        last4: true,
        validade: true,
        limite: true,
        saldoUtilizado: true,
        status: true,
        tipo: true,
        bandeira: true,
        dataSolicitacao: true,
        dataAprovacao: true,
        createdAt: true,
      },
    });

    res.json({
      success: true,
      message: 'Cartões listados com sucesso',
      data: { cartoes: cartoes.map(publicCard) },
    });

  } catch (error) {
    logger.error('Erro ao listar cartões:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * @swagger
 * /api/cards:
 *   post:
 *     summary: Solicitar novo cartão
 *     tags: [Cartões]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Card'
 *     responses:
 *       201:
 *         description: Cartão solicitado com sucesso
 */
router.post('/', validateCardRequest, async (req, res) => {
  try {
    const { tipo, limite } = req.body;

    // Verificar se usuário já tem cartão ativo do mesmo tipo
    const cartaoExistente = await prisma.cartao.findFirst({
      where: {
        userId: req.user.id,
        tipo,
        status: { in: ['aprovado', 'pendente'] }
      }
    });

    if (cartaoExistente) {
      return res.status(400).json({
        success: false,
        message: `Você já possui um cartão de ${tipo} ativo ou pendente`,
        code: 'CARD_ALREADY_EXISTS'
      });
    }

    const { maskedNumber, last4, bandeira, validade, cardToken } = generateDemoCardFields();

    const limiteFinal = limite || calculateCreditLimit(req.user.scoreCredito);

    const cartao = await prisma.cartao.create({
      data: {
        userId: req.user.id,
        maskedNumber,
        last4,
        validade,
        bandeira,
        cardToken,
        limite: limiteFinal,
        tipo,
        status: 'pendente',
      },
    });

    logger.banking('card_requested', req.user.id, {
      tipo,
      limite: limiteFinal,
      bandeira,
    });

    await recordAudit({
      userId: req.user.id,
      action: 'card.requested',
      entity: 'Cartao',
      entityId: cartao.id,
      metadata: { tipo, bandeira },
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });

    res.status(201).json({
      success: true,
      message: 'Cartão solicitado com sucesso',
      data: { cartao: publicCard(cartao) },
    });

  } catch (error) {
    logger.error('Erro ao solicitar cartão:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * @swagger
 * /api/cards/{id}/approve:
 *   post:
 *     summary: Aprovar cartão (admin)
 *     tags: [Cartões]
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
 *         description: Cartão aprovado com sucesso
 */
router.post('/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;

    const cartao = await prisma.cartao.findFirst({
      where: {
        id,
        userId: req.user.id,
        status: 'pendente'
      }
    });

    if (!cartao) {
      return res.status(404).json({
        success: false,
        message: 'Cartão não encontrado ou já processado',
        code: 'CARD_NOT_FOUND'
      });
    }

    const cartaoAtualizado = await prisma.cartao.update({
      where: { id },
      data: {
        status: 'aprovado',
        dataAprovacao: new Date()
      }
    });

    // Enviar notificação por email
    try {
      await sendCardNotification(
        { nome: req.user.nomeCompleto, email: req.user.email },
        {
          status: 'aprovado',
          tipo: cartao.tipo,
          bandeira: cartao.bandeira,
          limite: cartao.limite,
          dataAprovacao: cartaoAtualizado.dataAprovacao
        }
      );
    } catch (emailError) {
      logger.warn('Erro ao enviar notificação de cartão:', emailError);
    }

    logger.banking('card_approved', req.user.id, {
      cartaoId: id,
      tipo: cartao.tipo,
    });

    await recordAudit({
      userId: req.user.id,
      action: 'card.approved',
      entity: 'Cartao',
      entityId: id,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });

    res.json({
      success: true,
      message: 'Cartão aprovado com sucesso',
      data: { cartao: publicCard(cartaoAtualizado) },
    });

  } catch (error) {
    logger.error('Erro ao aprovar cartão:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * @swagger
 * /api/cards/{id}/block:
 *   post:
 *     summary: Bloquear cartão
 *     tags: [Cartões]
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
 *         description: Cartão bloqueado com sucesso
 */
router.post('/:id/block', async (req, res) => {
  try {
    const { id } = req.params;

    const cartao = await prisma.cartao.findFirst({
      where: {
        id,
        userId: req.user.id,
        status: 'aprovado'
      }
    });

    if (!cartao) {
      return res.status(404).json({
        success: false,
        message: 'Cartão não encontrado ou não está ativo',
        code: 'CARD_NOT_FOUND'
      });
    }

    const cartaoAtualizado = await prisma.cartao.update({
      where: { id },
      data: { status: 'bloqueado' }
    });

    logger.banking('card_blocked', req.user.id, {
      cartaoId: id,
      tipo: cartao.tipo,
    });

    await recordAudit({
      userId: req.user.id,
      action: 'card.blocked',
      entity: 'Cartao',
      entityId: id,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });

    res.json({
      success: true,
      message: 'Cartão bloqueado com sucesso',
      data: { cartao: publicCard(cartaoAtualizado) },
    });

  } catch (error) {
    logger.error('Erro ao bloquear cartão:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * @swagger
 * /api/cards/{id}/unblock:
 *   post:
 *     summary: Desbloquear cartão
 *     tags: [Cartões]
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
 *         description: Cartão desbloqueado com sucesso
 */
router.post('/:id/unblock', async (req, res) => {
  try {
    const { id } = req.params;

    const cartao = await prisma.cartao.findFirst({
      where: {
        id,
        userId: req.user.id,
        status: 'bloqueado'
      }
    });

    if (!cartao) {
      return res.status(404).json({
        success: false,
        message: 'Cartão não encontrado ou não está bloqueado',
        code: 'CARD_NOT_FOUND'
      });
    }

    const cartaoAtualizado = await prisma.cartao.update({
      where: { id },
      data: { status: 'aprovado' }
    });

    logger.banking('card_unblocked', req.user.id, {
      cartaoId: id,
      tipo: cartao.tipo,
    });

    await recordAudit({
      userId: req.user.id,
      action: 'card.unblocked',
      entity: 'Cartao',
      entityId: id,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });

    res.json({
      success: true,
      message: 'Cartão desbloqueado com sucesso',
      data: { cartao: publicCard(cartaoAtualizado) },
    });

  } catch (error) {
    logger.error('Erro ao desbloquear cartão:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * @swagger
 * /api/cards/{id}/limit:
 *   put:
 *     summary: Alterar limite do cartão
 *     tags: [Cartões]
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
 *             required:
 *               - novoLimite
 *             properties:
 *               novoLimite:
 *                 type: number
 *     responses:
 *       200:
 *         description: Limite alterado com sucesso
 */
router.put('/:id/limit', async (req, res) => {
  try {
    const { id } = req.params;
    const { novoLimite } = req.body;

    if (novoLimite < 100 || novoLimite > 50000) {
      return res.status(400).json({
        success: false,
        message: 'Limite deve estar entre R$ 100,00 e R$ 50.000,00',
        code: 'INVALID_LIMIT'
      });
    }

    const cartao = await prisma.cartao.findFirst({
      where: {
        id,
        userId: req.user.id,
        status: 'aprovado'
      }
    });

    if (!cartao) {
      return res.status(404).json({
        success: false,
        message: 'Cartão não encontrado ou não está ativo',
        code: 'CARD_NOT_FOUND'
      });
    }

    const cartaoAtualizado = await prisma.cartao.update({
      where: { id },
      data: { limite: novoLimite }
    });

    logger.banking('card_limit_changed', req.user.id, {
      cartaoId: id,
      limiteAnterior: cartao.limite,
      novoLimite,
    });

    await recordAudit({
      userId: req.user.id,
      action: 'card.limit_changed',
      entity: 'Cartao',
      entityId: id,
      metadata: { novoLimite },
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });

    res.json({
      success: true,
      message: 'Limite alterado com sucesso',
      data: { cartao: publicCard(cartaoAtualizado) },
    });

  } catch (error) {
    logger.error('Erro ao alterar limite do cartão:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

function generateExpiryDate() {
  const now = new Date();
  const year = now.getFullYear() + 5;
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${month}/${year}`;
}

/** Demo: últimos 4 dígitos e máscara; PAN completo nunca é persistido. */
function generateDemoCardFields() {
  const brands = ['visa', 'mastercard', 'elo'];
  const bandeira = brands[Math.floor(Math.random() * brands.length)];
  const last4 = String(Math.floor(1000 + Math.random() * 9000)).padStart(4, '0');
  const maskedNumber = `**** **** **** ${last4}`;
  const cardToken = `demo_${uuidv4()}`;
  const validade = generateExpiryDate();
  return { maskedNumber, last4, bandeira, cardToken, validade };
}

function calculateCreditLimit(scoreCredito) {
  // Calcular limite baseado no score de crédito
  if (scoreCredito >= 800) return 10000;
  if (scoreCredito >= 700) return 5000;
  if (scoreCredito >= 600) return 2000;
  return 1000;
}

module.exports = router;
