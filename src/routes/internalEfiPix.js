'use strict';

const express = require('express');
const { requireInternalApiKey } = require('../middleware/auth');
const logger = require('../utils/logger');
const pixEfiWebhookService = require('../services/pixEfiWebhookService');

const router = express.Router();

/**
 * POST /api/internal/efi/pix/webhook
 * Recebimento de notificação Pix Efí (corpo com array `pix`).
 * Autenticação: header `x-internal-key` = `EFI_PIX_WEBHOOK_INTERNAL_KEY`.
 * Não altera saldo nem liquida seguro/frete/cartão (Fase O).
 */
router.post('/webhook', requireInternalApiKey('EFI_PIX_WEBHOOK_INTERNAL_KEY'), async (req, res) => {
  try {
    const parsed = await pixEfiWebhookService.processEfiPixWebhookBody(req.body, {
      requestId: req.requestId,
      ip: req.ip,
    });

    if (!parsed.ok) {
      return res.status(400).json({
        success: false,
        code: parsed.code || 'INVALID_REQUEST',
        message: 'Payload inválido',
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        processed: parsed.results.length,
        results: parsed.results,
      },
    });
  } catch (error) {
    logger.error('internal_efi_pix_webhook_failed', {
      category: 'operational_error',
      component: 'internalEfiPix',
      requestId: req.requestId,
      message: error && error.message ? error.message : String(error || ''),
    });
    return res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR',
    });
  }
});

module.exports = router;
