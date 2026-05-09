const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { prisma } = require('../config/database');
const logger = require('../utils/logger');

const router = express.Router();

router.use(authenticateToken);

function toPublicNotification(row) {
  if (!row) return null;
  return {
    id: row.id,
    type: row.tipo,
    title: row.titulo,
    message: row.mensagem,
    status: row.isLida ? 'read' : 'unread',
    createdAt: row.dataEnvio || row.createdAt,
    readAt: row.readAt,
    metadata: row.metadata == null ? null : row.metadata,
  };
}

async function markOneRead(userId, id) {
  const notificacao = await prisma.notificacao.findFirst({
    where: { id, userId },
  });

  if (!notificacao) {
    return { error: 'NOTIFICATION_NOT_FOUND', status: 404 };
  }

  const notificacaoAtualizada = await prisma.notificacao.update({
    where: { id },
    data: { isLida: true, readAt: new Date() },
  });

  return { notificacao: notificacaoAtualizada };
}

/**
 * @swagger
 * /api/notifications:
 *   get:
 *     summary: Listar notificações do usuário
 */
router.get('/', async (req, res) => {
  try {
    if (req.query.countOnly === 'true') {
      const where = { userId: req.user.id };
      if (req.query.status === 'unread' || req.query.unread === 'true') {
        where.isLida = false;
      }
      const count = await prisma.notificacao.count({ where });
      return res.json({
        success: true,
        message: 'Contagem obtida com sucesso',
        data: { count },
      });
    }

    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const skip = (page - 1) * limit;

    const where = { userId: req.user.id };
    if (req.query.unread === 'true' || req.query.status === 'unread') {
      where.isLida = false;
    }

    const [rows, total, unreadCount] = await Promise.all([
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
          createdAt: true,
          readAt: true,
          metadata: true,
        },
      }),
      prisma.notificacao.count({ where }),
      prisma.notificacao.count({
        where: { userId: req.user.id, isLida: false },
      }),
    ]);

    const notifications = rows.map(toPublicNotification);

    res.json({
      success: true,
      message: 'Notificações listadas com sucesso',
      data: {
        notifications,
        notificacoes: notifications,
        unreadCount,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    logger.error('Erro ao listar notificações:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR',
    });
  }
});

/**
 * Contador dedicado (legado)
 */
router.get('/unread-count', async (req, res) => {
  try {
    const unreadCount = await prisma.notificacao.count({
      where: {
        userId: req.user.id,
        isLida: false,
      },
    });

    res.json({
      success: true,
      message: 'Contador obtido com sucesso',
      data: { unreadCount },
    });
  } catch (error) {
    logger.error('Erro ao obter contador de notificações:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR',
    });
  }
});

async function handleReadAll(req, res) {
  try {
    const now = new Date();
    const result = await prisma.notificacao.updateMany({
      where: {
        userId: req.user.id,
        isLida: false,
      },
      data: { isLida: true, readAt: now },
    });

    res.json({
      success: true,
      message: `${result.count} notificações marcadas como lidas`,
      data: { updatedCount: result.count },
    });
  } catch (error) {
    logger.error('Erro ao marcar todas as notificações como lidas:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR',
    });
  }
}

router.post('/read-all', handleReadAll);
router.put('/read-all', handleReadAll);

router.post('/send', async (req, res) => {
  try {
    const { titulo, mensagem, tipo } = req.body;

    if (!titulo || !mensagem || !tipo) {
      return res.status(400).json({
        success: false,
        message: 'Título, mensagem e tipo são obrigatórios',
        code: 'MISSING_PARAMETERS',
      });
    }

    const notificacao = await prisma.notificacao.create({
      data: {
        userId: req.user.id,
        titulo,
        mensagem,
        tipo,
      },
    });

    logger.info('Notificação criada:', {
      userId: req.user.id,
      titulo,
      tipo,
    });

    res.status(201).json({
      success: true,
      message: 'Notificação enviada com sucesso',
      data: { notificacao: toPublicNotification(notificacao) },
    });
  } catch (error) {
    logger.error('Erro ao enviar notificação:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR',
    });
  }
});

async function handleMarkRead(req, res) {
  try {
    const { id } = req.params;
    const result = await markOneRead(req.user.id, id);
    if (result.error) {
      return res.status(result.status).json({
        success: false,
        message: 'Notificação não encontrada',
        code: result.error,
      });
    }

    res.json({
      success: true,
      message: 'Notificação marcada como lida',
      data: { notification: toPublicNotification(result.notificacao) },
    });
  } catch (error) {
    logger.error('Erro ao marcar notificação como lida:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR',
    });
  }
}

router.post('/:id/read', handleMarkRead);
router.put('/:id/read', handleMarkRead);

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const notificacao = await prisma.notificacao.findFirst({
      where: {
        id,
        userId: req.user.id,
      },
    });

    if (!notificacao) {
      return res.status(404).json({
        success: false,
        message: 'Notificação não encontrada',
        code: 'NOTIFICATION_NOT_FOUND',
      });
    }

    await prisma.notificacao.delete({
      where: { id },
    });

    res.json({
      success: true,
      message: 'Notificação deletada com sucesso',
    });
  } catch (error) {
    logger.error('Erro ao deletar notificação:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR',
    });
  }
});

module.exports = router;
