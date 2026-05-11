'use strict';

const express = require('express');
const { authenticateToken, requireVerification } = require('../middleware/auth');
const { prisma } = require('../config/database');
const logger = require('../utils/logger');
const { createAccountDepositWithPix } = require('../services/accountDepositService');
const { mapRowToPixResponse } = require('../services/pixCobrancaEfiService');

const router = express.Router();

function serializeDeposit(row) {
  if (!row) return null;
  const amount = row.amount != null ? Number(row.amount) : null;
  return {
    id: row.id,
    userId: row.userId,
    amount: Number.isFinite(amount) ? amount : null,
    status: row.status,
    provider: row.provider,
    pixCobrancaId: row.pixCobrancaId || null,
    creditedMovementId: row.creditedMovementId || null,
    createdAt: row.createdAt ? row.createdAt.toISOString() : null,
    updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
    paidAt: row.paidAt ? row.paidAt.toISOString() : null,
    creditedAt: row.creditedAt ? row.creditedAt.toISOString() : null,
  };
}

function buildPixPayloadFromCob(cob) {
  if (!cob) return null;
  return mapRowToPixResponse(cob);
}

/**
 * POST /api/deposits/pix
 * Body: { amount: number }
 */
router.post('/pix', authenticateToken, requireVerification, async (req, res) => {
  try {
    const cpf = req.user.cpf ? String(req.user.cpf).replace(/\D/g, '') : '';
    if (!cpf || cpf.length !== 11) {
      return res.status(400).json({
        success: false,
        message: 'CPF do titular inválido para emissão de Pix.',
        code: 'INVALID_DEBTOR_DOCUMENT',
      });
    }

    const result = await createAccountDepositWithPix({
      userId: req.user.id,
      debtorCpf: cpf,
      debtorName: req.user.nomeCompleto,
      amountRaw: req.body && req.body.amount,
    });

    if (!result.ok) {
      const status = result.httpStatus || 400;
      const code = result.code || 'INVALID_AMOUNT';
      if (status >= 500) {
        logger.error('deposit_pix_create_failed', {
          category: 'operational_error',
          component: 'depositsRoute',
          code,
          userId: req.user.id,
        });
      }
      return res.status(status).json({
        success: false,
        message: result.message || 'Não foi possível gerar o depósito Pix.',
        code: status === 503 && code !== 'PIX_PROVIDER_UNAVAILABLE' ? 'PIX_PROVIDER_UNAVAILABLE' : code,
      });
    }

    return res.status(201).json({
      success: true,
      data: {
        deposit: serializeDeposit(result.deposit),
        pix: result.pix,
      },
    });
  } catch (err) {
    logger.error('deposit_pix_unexpected', {
      category: 'operational_error',
      component: 'depositsRoute',
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
 * GET /api/deposits
 */
router.get('/', authenticateToken, requireVerification, async (req, res) => {
  try {
    const rows = await prisma.accountDeposit.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        userId: true,
        amount: true,
        status: true,
        provider: true,
        pixCobrancaId: true,
        creditedMovementId: true,
        createdAt: true,
        updatedAt: true,
        paidAt: true,
        creditedAt: true,
      },
    });
    return res.json({
      success: true,
      data: {
        deposits: rows.map(serializeDeposit),
      },
    });
  } catch (err) {
    logger.error('deposits_list_failed', { message: err.message });
    return res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR',
    });
  }
});

/**
 * GET /api/deposits/:id
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

    const row = await prisma.accountDeposit.findFirst({
      where: { id, userId: req.user.id },
      include: {
        pixCobranca: true,
      },
    });

    if (!row) {
      return res.status(404).json({
        success: false,
        message: 'Depósito não encontrado',
        code: 'NOT_FOUND',
      });
    }

    const deposit = serializeDeposit(row);
    let pix = null;
    if (row.pixCobranca && row.status !== 'CREDITADO') {
      pix = buildPixPayloadFromCob(row.pixCobranca);
    } else if (row.pixCobranca && row.status === 'CREDITADO') {
      pix = {
        txid: row.pixCobranca.txid,
        pixStatus: row.pixCobranca.status,
        amount: Number(row.pixCobranca.amount),
        paidAt: row.pixCobranca.paidAt ? row.pixCobranca.paidAt.toISOString() : null,
        expiresAt: row.pixCobranca.expiresAt ? row.pixCobranca.expiresAt.toISOString() : null,
        provider: row.pixCobranca.provider,
      };
    }

    return res.json({
      success: true,
      data: {
        deposit,
        pix,
      },
    });
  } catch (err) {
    logger.error('deposit_get_failed', { message: err.message });
    return res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR',
    });
  }
});

module.exports = router;
