#!/usr/bin/env node
'use strict';

/**
 * Fase O.1 — Cadastra e consulta webhook Pix na Efí (PUT/GET /v2/webhook/:chave).
 * Usa credenciais do ambiente (Railway: `railway run node scripts/efi-o1-register-pix-webhook.js`).
 * Não imprime segredos, certificados nem token completo na URL.
 */

require('dotenv').config();

const { putPixWebhook, getPixWebhook, EfiPixClientError } = require('../src/services/efiPixClient');

function redactWebhookPayload(obj) {
  if (obj == null || typeof obj !== 'object') return obj;
  const out = { ...obj };
  if (typeof out.webhookUrl === 'string') {
    out.webhookUrl = out.webhookUrl.replace(/([?&])efiwk=[^&]*/gi, '$1efiwk=***');
  }
  return out;
}

async function main() {
  const base =
    process.env.EFI_O1_WEBHOOK_BASE_URL ||
    process.env.AGILBANK_PUBLIC_API_URL ||
    'https://aggibank-production.up.railway.app';
  const baseTrim = String(base).replace(/\/+$/, '');
  const token = String(process.env.EFI_PIX_WEBHOOK_CALLBACK_TOKEN || '').trim();
  const pathSuffix = '/api/internal/efi/pix/webhook';
  let webhookUrl;
  if (token) {
    webhookUrl = `${baseTrim}${pathSuffix}?ignorar=&efiwk=${encodeURIComponent(token)}`;
  } else {
    webhookUrl = `${baseTrim}${pathSuffix}`;
    console.warn(
      '[efi-o1] EFI_PIX_WEBHOOK_CALLBACK_TOKEN ausente: cadastrando URL sem query. ' +
        'Notificações reais da Efí tendem a receber 403 até definir o token na Railway e recadastrar com ?ignorar=&efiwk=…',
    );
  }

  console.log('[efi-o1] Cadastrando webhook Pix (URL com token omitido no log)...');
  try {
    const putRes = await putPixWebhook({ webhookUrl });
    console.log('[efi-o1] PUT httpStatus=', putRes.httpStatus);
    console.log('[efi-o1] PUT body (redacted)=', JSON.stringify(redactWebhookPayload(putRes.data)));
  } catch (e) {
    if (e instanceof EfiPixClientError) {
      console.error('[efi-o1] PUT falhou:', e.code, e.message, 'status=', e.httpStatus);
    } else {
      console.error('[efi-o1] PUT erro:', e.message);
    }
    process.exit(2);
  }

  console.log('[efi-o1] Consultando webhook...');
  try {
    const getRes = await getPixWebhook();
    console.log('[efi-o1] GET httpStatus=', getRes.httpStatus);
    console.log('[efi-o1] GET body (redacted)=', JSON.stringify(redactWebhookPayload(getRes.data)));
  } catch (e) {
    if (e instanceof EfiPixClientError) {
      console.error('[efi-o1] GET falhou:', e.code, e.message, 'status=', e.httpStatus);
    } else {
      console.error('[efi-o1] GET erro:', e.message);
    }
    process.exit(3);
  }

  console.log('[efi-o1] Concluído.');
}

main();
