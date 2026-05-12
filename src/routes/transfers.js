'use strict';

const express = require('express');
const { authenticateToken, requireVerification } = require('../middleware/auth');
const { prisma } = require('../config/database');
const logger = require('../utils/logger');
const {
  executeInternalTransfer,
  serializeTransferPublic,
  formatCounterpartyLabel,
} = require('../services/internalTransferService');
const {
  notifyInternalTransferSent,
  notifyInternalTransferReceived,
} = require('../services/inAppNotificationService');

const router = express.Router();

const counterpartySelect = {
  id: true,
  nomeCompleto: true,
  email: true,
  numeroConta: true,
  digitoConta: true,
};

/**
 * POST /api/transfers/internal
 * Body: { to: string, amount: number, description?: string }
 * Header opcional: Idempotency-Key
 */
router.post('/internal', authenticateToken, requireVerification, async (req, res) => {
  try {
    const idempotencyHeader = req.get('Idempotency-Key') || req.get('idempotency-key') || '';

    const result = await executeInternalTransfer({
      fromUserId: req.user.id,
      fromUserNome: req.user.nomeCompleto,
      to: req.body && req.body.to,
      amountRaw: req.body && req.body.amount,
      description: req.body && req.body.description,
      idempotencyHeader,
    });

    if (!result.ok) {
      const status = result.httpStatus || 400;
      if (status >= 500) {
        logger.error('internal_transfer_failed', {
          category: 'operational_error',
          component: 'transfersRoute',
          code: result.code,
          userId: req.user.id,
        });
      }
      return res.status(status).json({
        success: false,
        message: result.message || 'Não foi possível concluir a transferência.',
        code: result.code || 'INTERNAL_ERROR',
      });
    }

    const transfer = result.transfer;
    const serialized = serializeTransferPublic(transfer, req.user.id);

    if (!result.replay && transfer && transfer.status === 'CONCLUIDA') {
      const toUid = transfer.toUserId;
      const counterpartyTo = result.recipient || transfer.toUser;
      const counterpartyFrom = {
        nomeCompleto: req.user.nomeCompleto,
        numeroConta: req.user.numeroConta,
        digitoConta: req.user.digitoConta,
      };
      const amountNum = transfer.amount != null ? Number(transfer.amount) : null;

      await notifyInternalTransferSent({
        userId: req.user.id,
        transferId: transfer.id,
        amount: amountNum,
        counterpartyLabel: formatCounterpartyLabel(counterpartyTo),
      });
      if (toUid) {
        await notifyInternalTransferReceived({
          userId: toUid,
          transferId: transfer.id,
          amount: amountNum,
          counterpartyLabel: formatCounterpartyLabel(counterpartyFrom),
        });
      }
    }

    const statusCode = result.replay ? 200 : 201;
    return res.status(statusCode).json({
      success: true,
      data: {
        replay: !!result.replay,
        transfer: serialized,
      },
    });
  } catch (err) {
    logger.error('internal_transfer_unexpected', {
      category: 'operational_error',
      component: 'transfersRoute',
      message: err && err.message ? err.message : String(err),
    });
    return res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR',
    });
  }
});

/**
 * GET /api/transfers
 */
router.get('/', authenticateToken, requireVerification, async (req, res) => {
  try {
    const rows = await prisma.internalTransfer.findMany({
      where: {
        OR: [{ fromUserId: req.user.id }, { toUserId: req.user.id }],
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        fromUser: { select: counterpartySelect },
        toUser: { select: counterpartySelect },
      },
    });

    return res.json({
      success: true,
      data: {
        transfers: rows.map((t) => serializeTransferPublic(t, req.user.id)),
      },
    });
  } catch (err) {
    logger.error('transfers_list_failed', { message: err.message });
    return res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR',
    });
  }
});

/**
 * GET /api/transfers/:id
 */
router.get('/:id', authenticateToken, requireVerification, async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Identificador inválido',
        code: 'INVALID_ID',
      });
    }

    const row = await prisma.internalTransfer.findFirst({
      where: {
        id,
        OR: [{ fromUserId: req.user.id }, { toUserId: req.user.id }],
      },
      include: {
        fromUser: { select: counterpartySelect },
        toUser: { select: counterpartySelect },
      },
    });

    if (!row) {
      return res.status(404).json({
        success: false,
        message: 'Transferência não encontrada',
        code: 'NOT_FOUND',
      });
    }

    return res.json({
      success: true,
      data: {
        transfer: serializeTransferPublic(row, req.user.id),
      },
    });
  } catch (err) {
    logger.error('transfer_get_failed', { message: err.message });
    return res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR',
    });
  }
});

module.exports = router;
