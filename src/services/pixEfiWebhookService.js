'use strict';

const { prisma } = require('../config/database');
const logger = require('../utils/logger');
const { recordAudit } = require('../utils/auditLog');

const SENSITIVE_KEYS = new Set([
  'pixcopiaecola',
  'authorization',
  'client_secret',
  'certificado',
  'senha',
]);

function sanitizeForStorage(value, depth = 0) {
  if (depth > 6) return '[max-depth]';
  if (value == null) return value;
  if (typeof value === 'string') {
    const t = value.length > 400 ? `${value.slice(0, 400)}…` : value;
    return t;
  }
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value.map((v) => sanitizeForStorage(v, depth + 1));
  }
  const out = {};
  Object.keys(value).forEach((k) => {
    if (SENSITIVE_KEYS.has(String(k).toLowerCase())) {
      out[k] = '[redacted]';
      return;
    }
    out[k] = sanitizeForStorage(value[k], depth + 1);
  });
  return out;
}

function moneyCents(n) {
  const x = Number(String(n).replace(',', '.'));
  if (!Number.isFinite(x)) return null;
  return Math.round(x * 100);
}

function amountsMatchCob(cobAmount, receivedValor) {
  const a = moneyCents(cobAmount);
  const b = moneyCents(receivedValor);
  if (a == null || b == null) return false;
  return a === b;
}

function buildIdempotencyKey(endToEndId) {
  return `efi:e2e:${String(endToEndId).trim()}`;
}

/**
 * Processa corpo do webhook Pix Efí (array `pix`).
 * Atualiza apenas PixCobranca; não altera saldo nem entidades de negócio.
 *
 * @returns {Promise<{ results: Array<{ txid?: string, endToEndId?: string, result: string }> }>}
 */
async function processEfiPixWebhookBody(body, { requestId, ip } = {}) {
  const results = [];
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, code: 'INVALID_BODY', results };
  }
  if (!Array.isArray(body.pix)) {
    return { ok: false, code: 'INVALID_BODY', results };
  }
  const pixArr = body.pix;
  if (pixArr.length === 0) {
    return { ok: true, code: 'NO_PIX_ITEMS', results };
  }

  for (const raw of pixArr) {
    const item = raw && typeof raw === 'object' ? raw : null;
    if (!item) {
      results.push({ result: 'INVALID_ITEM' });
      // eslint-disable-next-line no-continue
      continue;
    }
    const txid = item.txid != null ? String(item.txid).trim() : '';
    const endToEndId = item.endToEndId != null ? String(item.endToEndId).trim() : '';
    const valor = item.valor != null ? String(item.valor).trim() : '';
    const horario = item.horario != null ? String(item.horario).trim() : '';

    if (!endToEndId) {
      results.push({ txid: txid || null, result: 'MISSING_END_TO_END_ID' });
      // eslint-disable-next-line no-continue
      continue;
    }

    const idempotencyKey = buildIdempotencyKey(endToEndId);

    const dup = await prisma.pixWebhookEvent.findUnique({ where: { idempotencyKey } });
    if (dup) {
      results.push({ txid: txid || null, endToEndId, result: 'DUPLICATE' });
      // eslint-disable-next-line no-continue
      continue;
    }

    const metaBase = {
      requestId: requestId || null,
      ip: ip || null,
      horario: horario || null,
    };

    try {
      // eslint-disable-next-line no-await-in-loop
      const one = await prisma.$transaction(async (tx) => {
        const again = await tx.pixWebhookEvent.findUnique({ where: { idempotencyKey } });
        if (again) {
          return { result: 'DUPLICATE', event: again };
        }

        if (!txid) {
          const ev = await tx.pixWebhookEvent.create({
            data: {
              idempotencyKey,
              txid: null,
              endToEndId,
              amountReceived: valor || null,
              processingResult: 'MISSING_TXID',
              pixCobrancaId: null,
              metadata: { ...metaBase, item: sanitizeForStorage(item) },
            },
          });
          return { result: 'MISSING_TXID', event: ev };
        }

        const cob = await tx.pixCobranca.findUnique({ where: { txid } });
        if (!cob) {
          const ev = await tx.pixWebhookEvent.create({
            data: {
              idempotencyKey,
              txid,
              endToEndId,
              amountReceived: valor || null,
              processingResult: 'ORPHAN_TXID',
              pixCobrancaId: null,
              metadata: { ...metaBase, item: sanitizeForStorage(item) },
            },
          });
          await recordAudit({
            userId: null,
            action: 'efi.pix.webhook.orphan_txid',
            entity: 'PixWebhookEvent',
            entityId: ev.id,
            metadata: { txid, endToEndId, requestId: requestId || null },
            ip: ip || null,
            userAgent: null,
          });
          return { result: 'ORPHAN_TXID', event: ev };
        }

        if (!amountsMatchCob(cob.amount, valor)) {
          const ev = await tx.pixWebhookEvent.create({
            data: {
              idempotencyKey,
              txid,
              endToEndId,
              amountReceived: valor || null,
              processingResult: 'AMOUNT_MISMATCH',
              pixCobrancaId: cob.id,
              metadata: {
                ...metaBase,
                expectedCents: moneyCents(cob.amount),
                receivedCents: moneyCents(valor),
                item: sanitizeForStorage(item),
              },
            },
          });
          await recordAudit({
            userId: cob.userId,
            action: 'efi.pix.webhook.amount_mismatch',
            entity: 'PixCobranca',
            entityId: cob.id,
            metadata: { txid, endToEndId, requestId: requestId || null },
            ip: ip || null,
            userAgent: null,
          });
          return { result: 'AMOUNT_MISMATCH', event: ev };
        }

        if (cob.status === 'PAGA') {
          const ev = await tx.pixWebhookEvent.create({
            data: {
              idempotencyKey,
              txid,
              endToEndId,
              amountReceived: valor || null,
              processingResult: 'ALREADY_PAID',
              pixCobrancaId: cob.id,
              metadata: { ...metaBase, item: sanitizeForStorage(item) },
            },
          });
          return { result: 'ALREADY_PAID', event: ev };
        }

        const paidAt = horario ? new Date(horario) : new Date();
        const updated = await tx.pixCobranca.update({
          where: { id: cob.id },
          data: {
            status: 'PAGA',
            paidAt,
            endToEndId,
            rawProviderPayload: sanitizeForStorage(item),
          },
        });

        const ev = await tx.pixWebhookEvent.create({
          data: {
            idempotencyKey,
            txid,
            endToEndId,
            amountReceived: valor || null,
            processingResult: 'PROCESSED',
            pixCobrancaId: cob.id,
            metadata: { ...metaBase, item: sanitizeForStorage(item) },
          },
        });

        await recordAudit({
          userId: cob.userId,
          action: 'efi.pix.webhook.paid',
          entity: 'PixCobranca',
          entityId: cob.id,
          metadata: {
            txid,
            endToEndId,
            requestId: requestId || null,
          },
          ip: ip || null,
          userAgent: null,
        });

        return { result: 'PROCESSED', event: ev, cob: updated };
      });

      results.push({
        txid: txid || null,
        endToEndId,
        result: one.result,
      });
    } catch (e) {
      const code = e && e.code ? e.code : '';
      if (code === 'P2002') {
        results.push({ txid, endToEndId, result: 'DUPLICATE' });
      } else {
        logger.error('efi_pix_webhook_transaction_failed', {
          category: 'operational_error',
          component: 'pixEfiWebhookService',
          requestId: requestId || null,
          message: e.message,
        });
        throw e;
      }
    }
  }

  return { ok: true, code: 'OK', results };
}

module.exports = {
  processEfiPixWebhookBody,
  sanitizeForStorage,
  buildIdempotencyKey,
};
