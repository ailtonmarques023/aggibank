'use strict';

const express = require('express');
const { requireEfiPixWebhookAuth } = require('../middleware/auth');
const logger = require('../utils/logger');
const pixEfiWebhookService = require('../services/pixEfiWebhookService');

const router = express.Router();

async function handleEfiPixWebhookPost(req, res) {
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
}

/**
 * POST /api/internal/efi/pix/webhook
 * Efí com `?ignorar=` envia POST para esta URL (sem sufixo /pix).
 * Autenticação: `x-internal-key` **ou** query `efiwk` (= EFI_PIX_WEBHOOK_CALLBACK_TOKEN).
 */
router.post('/webhook', requireEfiPixWebhookAuth, handleEfiPixWebhookPost);

/**
 * POST /api/internal/efi/pix/webhook/pix
 * Efí padrão (sem `?ignorar=`) envia POST para {webhookUrl}/pix.
 */
router.post('/webhook/pix', requireEfiPixWebhookAuth, handleEfiPixWebhookPost);

module.exports = router;
