const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { prisma } = require('../config/database');
const logger = require('../utils/logger');

const router = express.Router();

// Aplicar autenticação em todas as rotas
router.use(authenticateToken);

/**
 * @swagger
 * /api/notifications:
 *   get:
 *     summary: Listar notificações do usuário
 *     tags: [Notificações]
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
 *         name: unread
 *         schema:
 *           type: boolean
 *         description: Filtrar apenas não lidas
 *     responses:
 *       200:
 *         description: Notificações listadas com sucesso
 */
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const unread = req.query.unread === 'true';
    const skip = (page - 1) * limit;

    const where = { userId: req.user.id };
    if (unread) {
      where.isLida = false;
    }

    const [notificacoes, total, unreadCount] = await Promise.all([
      prisma.notificacao.findMany({
        where,
        orderBy: { dataEnvio: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          titulo: true,
          mensagem: true,
          tipo: true,
          isLida: true,
          dataEnvio: true,
          createdAt: true
        }
      }),
      prisma.notificacao.count({ where }),
      prisma.notificacao.count({
        where: { userId: req.user.id, isLida: false }
      })
    ]);

    res.json({
      success: true,
      message: 'Notificações listadas com sucesso',
      data: {
        notificacoes,
        unreadCount,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    logger.error('Erro ao listar notificações:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * @swagger
 * /api/notifications/{id}/read:
 *   put:
 *     summary: Marcar notificação como lida
 *     tags: [Notificações]
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
 *         description: Notificação marcada como lida
 */
router.put('/:id/read', async (req, res) => {
  try {
    const { id } = req.params;

    const notificacao = await prisma.notificacao.findFirst({
      where: {
        id,
        userId: req.user.id
      }
    });

    if (!notificacao) {
      return res.status(404).json({
        success: false,
        message: 'Notificação não encontrada',
        code: 'NOTIFICATION_NOT_FOUND'
      });
    }

    const notificacaoAtualizada = await prisma.notificacao.update({
      where: { id },
      data: { isLida: true }
    });

    res.json({
      success: true,
      message: 'Notificação marcada como lida',
      data: { notificacao: notificacaoAtualizada }
    });

  } catch (error) {
    logger.error('Erro ao marcar notificação como lida:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * @swagger
 * /api/notifications/read-all:
 *   put:
 *     summary: Marcar todas as notificações como lidas
 *     tags: [Notificações]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Todas as notificações marcadas como lidas
 */
router.put('/read-all', async (req, res) => {
  try {
    const result = await prisma.notificacao.updateMany({
      where: {
        userId: req.user.id,
        isLida: false
      },
      data: { isLida: true }
    });

    res.json({
      success: true,
      message: `${result.count} notificações marcadas como lidas`,
      data: { updatedCount: result.count }
    });

  } catch (error) {
    logger.error('Erro ao marcar todas as notificações como lidas:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * @swagger
 * /api/notifications/{id}:
 *   delete:
 *     summary: Deletar notificação
 *     tags: [Notificações]
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
 *         description: Notificação deletada com sucesso
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const notificacao = await prisma.notificacao.findFirst({
      where: {
        id,
        userId: req.user.id
      }
    });

    if (!notificacao) {
      return res.status(404).json({
        success: false,
        message: 'Notificação não encontrada',
        code: 'NOTIFICATION_NOT_FOUND'
      });
    }

    await prisma.notificacao.delete({
      where: { id }
    });

    res.json({
      success: true,
      message: 'Notificação deletada com sucesso'
    });

  } catch (error) {
    logger.error('Erro ao deletar notificação:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * @swagger
 * /api/notifications/unread-count:
 *   get:
 *     summary: Obter contador de notificações não lidas
 *     tags: [Notificações]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Contador obtido com sucesso
 */
router.get('/unread-count', async (req, res) => {
  try {
    const unreadCount = await prisma.notificacao.count({
      where: {
        userId: req.user.id,
        isLida: false
      }
    });

    res.json({
      success: true,
      message: 'Contador obtido com sucesso',
      data: { unreadCount }
    });

  } catch (error) {
    logger.error('Erro ao obter contador de notificações:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * @swagger
 * /api/notifications/send:
 *   post:
 *     summary: Enviar notificação (interno)
 *     tags: [Notificações]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - titulo
 *               - mensagem
 *               - tipo
 *             properties:
 *               titulo:
 *                 type: string
 *               mensagem:
 *                 type: string
 *               tipo:
 *                 type: string
 *                 enum: [info, warning, success, error]
 *     responses:
 *       201:
 *         description: Notificação enviada com sucesso
 */
router.post('/send', async (req, res) => {
  try {
    const { titulo, mensagem, tipo } = req.body;

    if (!titulo || !mensagem || !tipo) {
      return res.status(400).json({
        success: false,
        message: 'Título, mensagem e tipo são obrigatórios',
        code: 'MISSING_PARAMETERS'
      });
    }

    const notificacao = await prisma.notificacao.create({
      data: {
        userId: req.user.id,
        titulo,
        mensagem,
        tipo
      }
    });

    logger.info('Notificação criada:', {
      userId: req.user.id,
      titulo,
      tipo
    });

    res.status(201).json({
      success: true,
      message: 'Notificação enviada com sucesso',
      data: { notificacao }
    });

  } catch (error) {
    logger.error('Erro ao enviar notificação:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

module.exports = router;
