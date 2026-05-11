'use strict';

const express = require('express');
const { requireEfiPixWebhookAuth } = require('../middleware/auth');
const logger = require('../utils/logger');
const pixProviderService = require('../services/pix/pixProviderService');

const router = express.Router();

/**
 * Ping de cadastro da Efí: corpo vazio / sem `pix` → 2xx sem tocar no serviço.
 * `pix: []` → 2xx sem processar itens.
 * `pix` presente e não-array → 400.
 * `pix` com itens → fluxo normal.
 */
function classifyEfiPixWebhookPayload(body) {
  if (body == null) return 'VALIDATION';
  if (typeof body !== 'object' || Array.isArray(body)) return 'INVALID_BODY';
  if (!Object.prototype.hasOwnProperty.call(body, 'pix')) return 'VALIDATION';
  const pix = body.pix;
  if (!Array.isArray(pix)) return 'INVALID_BODY';
  if (pix.length === 0) return 'NO_PIX_ITEMS';
  return 'PROCESS';
}

async function handleEfiPixWebhookPost(req, res) {
  try {
    const kind = classifyEfiPixWebhookPayload(req.body);
    if (kind === 'VALIDATION') {
      logger.info('efi_pix_webhook_validation_ok', {
        category: 'operational',
        component: 'internalEfiPix',
        requestId: req.requestId,
      });
      return res.status(200).json({ success: true, code: 'EFI_WEBHOOK_VALIDATION_OK' });
    }
    if (kind === 'NO_PIX_ITEMS') {
      logger.info('efi_pix_webhook_no_pix_items', {
        category: 'operational',
        component: 'internalEfiPix',
        requestId: req.requestId,
      });
      return res.status(200).json({ success: true, code: 'NO_PIX_ITEMS' });
    }
    if (kind === 'INVALID_BODY') {
      logger.warn('efi_pix_webhook_invalid_body', {
        category: 'operational',
        component: 'internalEfiPix',
        requestId: req.requestId,
        reason: 'pix_not_array_or_bad_root',
      });
      return res.status(400).json({
        success: false,
        code: 'INVALID_BODY',
        message: 'Payload inválido',
      });
    }

    const parsed = await pixProviderService.processChargeWebhookBody(req.body, {
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
