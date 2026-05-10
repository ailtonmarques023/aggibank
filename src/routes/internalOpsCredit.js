'use strict';

const express = require('express');
const router = express.Router();
const { prisma } = require('../config/database');
const { requireInternalApiKey } = require('../middleware/auth');
const { LedgerError, registrarCreditoSaldoAtual } = require('../services/ledgerService');
const { recordAudit } = require('../utils/auditLog');
const logger = require('../utils/logger');

function blockProductionOperationalCredit(_req, res, next) {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({
      success: false,
      message: 'Crédito operacional de homologação não permitido em produção',
      code: 'STAGING_CREDIT_FORBIDDEN_IN_PRODUCTION',
    });
  }
  next();
}

router.use(blockProductionOperationalCredit);
router.use(requireInternalApiKey('OPS_CREDIT_INTERNAL_KEY'));

/**
 * POST /credit-test-balance
 * Uso exclusivo staging/homologação: servidor + chave interna (não é contrato do app público).
 */
router.post('/credit-test-balance', async (req, res) => {
  try {
    const { userId, valor, motivo, idempotencyKey, referenciaOperador } = req.body || {};

    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'userId é obrigatório',
        code: 'VALIDATION_ERROR',
      });
    }
    if (valor === undefined || valor === null || valor === '') {
      return res.status(400).json({
        success: false,
        message: 'valor é obrigatório',
        code: 'VALIDATION_ERROR',
      });
    }
    if (!motivo || typeof motivo !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'motivo é obrigatório',
        code: 'VALIDATION_ERROR',
      });
    }
    if (!idempotencyKey || typeof idempotencyKey !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'idempotencyKey é obrigatório',
        code: 'VALIDATION_ERROR',
      });
    }
    if (!referenciaOperador || typeof referenciaOperador !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'referenciaOperador é obrigatório',
        code: 'VALIDATION_ERROR',
      });
    }

    const movimentacao = await prisma.$transaction(async (tx) =>
      registrarCreditoSaldoAtual(tx, {
        userId,
        valorCredito: valor,
        tipo: 'credito',
        descricao: `[Homologação/staging] ${String(motivo).slice(0, 500)}`,
        categoria: 'ajuste_operacional_staging',
        referenceType: 'operational_credit_staging',
        referenceId: idempotencyKey,
        idempotencyKey,
      }),
    );

    const userAfter = await prisma.user.findUnique({
      where: { id: userId },
      select: { saldoAtual: true },
    });

    await recordAudit({
      userId,
      action: 'ops.staging_credit_available',
      entity: 'Movimentacao',
      entityId: movimentacao.id,
      metadata: {
        valor: Number(valor),
        motivo: String(motivo).slice(0, 500),
        idempotencyKey,
        referenciaOperador: String(referenciaOperador).slice(0, 200),
        saldoAtual: userAfter != null ? Number(userAfter.saldoAtual) : null,
      },
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    return res.status(200).json({
      success: true,
      data: {
        movimentacao,
        saldoAtual: userAfter != null ? Number(userAfter.saldoAtual) : null,
      },
    });
  } catch (err) {
    if (err instanceof LedgerError) {
      return res.status(err.httpStatus).json({
        success: false,
        message: err.message,
        code: err.code,
      });
    }
    logger.error(err instanceof Error ? err : new Error(String(err)), {
      category: 'operational_error',
      component: 'internal_ops_credit',
    });
    return res.status(500).json({
      success: false,
      message: 'Erro interno ao processar crédito operacional',
      code: 'INTERNAL_ERROR',
    });
  }
});

module.exports = router;
