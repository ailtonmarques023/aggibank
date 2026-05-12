#!/usr/bin/env node
/**
 * Fase R — Conciliação de Pix Efí já pago que não gerou webhook no AgilBank.
 *
 * - Consulta a Efí (fonte de verdade): GET /v2/cob/:txid e, se necessário, GET /v2/pix.
 * - Não cria nova cobrança (sem PUT /v2/cob).
 * - Reaproveita `processEfiPixWebhookBody` (Fase O + settlement P).
 *
 * Uso:
 *   railway run node scripts/efi-reconcile-received-pix.js --dry-run
 *   railway run node scripts/efi-reconcile-received-pix.js --dry-run --txid=SEU_TXID
 *   railway run node scripts/efi-reconcile-received-pix.js --apply --txid=SEU_TXID
 *
 * Variáveis: mesmas de `efiPixClient` (EFI_*, certificado, chave). Escopos cob.read + pix.read.
 */
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { prisma } = require('../src/config/database');
const efiPixClient = require('../src/services/efiPixClient');
const { processEfiPixWebhookBody } = require('../src/services/pixEfiWebhookService');
const { recordAudit } = require('../src/utils/auditLog');
const {
  RECONCILE_ACTIVE_STATUSES,
  RECONCILE_SUPPORTED_LINKED_TYPES,
  isEfiReconcileEligible,
  normalizeTxidInput,
  pickConfirmedPixFromCobPayload,
  pickPixFromReceivedListForCob,
  toWebhookPixItem,
} = require('../src/utils/efiReconcilePix');

const ACTIVE = RECONCILE_ACTIVE_STATUSES;
const SUPPORTED_LINKED_TYPES = RECONCILE_SUPPORTED_LINKED_TYPES;

function parseArgs() {
  const out = { dryRun: true, txid: null, days: 14, limit: 15 };
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--apply') out.dryRun = false;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--txid') {
      out.txid = normalizeTxidInput(args[i + 1]);
      i += 1;
    } else if (a.startsWith('--txid=')) out.txid = normalizeTxidInput(a.slice('--txid='.length));
    else if (a.startsWith('--days=')) out.days = Math.max(1, parseInt(a.slice('--days='.length), 10) || 14);
    else if (a.startsWith('--limit=')) out.limit = Math.min(50, Math.max(1, parseInt(a.slice('--limit='.length), 10) || 15));
  }
  return out;
}

function summarizeEfiCob(efiCob) {
  if (!efiCob || typeof efiCob !== 'object') return { found: false };
  return {
    found: true,
    status: efiCob.status != null ? String(efiCob.status) : null,
    pixCount: Array.isArray(efiCob.pix) ? efiCob.pix.length : 0,
    valorOriginal:
      efiCob.valor && efiCob.valor.original != null ? String(efiCob.valor.original) : null,
  };
}

async function resolvePaidPixFromEfi(cob, lookbackDays) {
  let efiCob = null;
  try {
    efiCob = await efiPixClient.getCobByTxid(cob.txid);
  } catch (e) {
    return { error: e.message, item: null, source: null, efiSummary: null };
  }

  if (efiCob) {
    const p = pickConfirmedPixFromCobPayload(cob, efiCob);
    if (p) {
      return {
        item: toWebhookPixItem(p, cob.txid),
        source: 'cob_get',
        efiSummary: summarizeEfiCob(efiCob),
      };
    }
  }

  const days = Math.max(1, lookbackDays || 14);
  const startMs = Math.min(new Date(cob.createdAt).getTime() - 86400000, Date.now() - days * 86400000);
  const start = new Date(startMs).toISOString();
  const end = new Date(Date.now() + 3600000).toISOString();
  let list;
  try {
    list = await efiPixClient.listPixReceived({
      inicioIso: start,
      fimIso: end,
      txid: cob.txid,
    });
  } catch (e) {
    return {
      error: e.message,
      item: null,
      source: null,
      efiSummary: summarizeEfiCob(efiCob),
    };
  }

  const p2 = pickPixFromReceivedListForCob(cob, list);
  if (p2) {
    return {
      item: toWebhookPixItem(p2, cob.txid),
      source: 'pix_list',
      efiSummary: summarizeEfiCob(efiCob),
    };
  }

  return { item: null, source: null, efiSummary: summarizeEfiCob(efiCob), error: null };
}

async function main() {
  const opts = parseArgs();

  if (!efiPixClient.isEfiPixConfigured()) {
    console.error(
      JSON.stringify({
        ok: false,
        code: 'EFI_NOT_CONFIGURED',
        message: 'Credenciais/certificado Efí incompletos ou produção sem EFI_PIX_ENABLE_PRODUCTION=true',
      }),
    );
    process.exit(1);
  }

  let rows;
  let txidDiagnostic = null;
  if (opts.txid) {
    const one = await prisma.pixCobranca.findUnique({
      where: { txid: opts.txid },
      select: {
        id: true,
        userId: true,
        txid: true,
        status: true,
        amount: true,
        provider: true,
        linkedEntityType: true,
        linkedEntityId: true,
        createdAt: true,
      },
    });
    rows = one ? [one] : [];
    if (!one) {
      txidDiagnostic = { outcome: 'TXID_NOT_FOUND' };
    }
  } else {
    rows = await prisma.pixCobranca.findMany({
      where: {
        provider: 'EFI',
        status: { in: ACTIVE },
        linkedEntityType: { in: SUPPORTED_LINKED_TYPES },
      },
      orderBy: { createdAt: 'desc' },
      take: opts.limit,
      select: {
        id: true,
        userId: true,
        txid: true,
        status: true,
        amount: true,
        provider: true,
        linkedEntityType: true,
        linkedEntityId: true,
        createdAt: true,
      },
    });
  }

  const report = {
    ok: true,
    mode: opts.dryRun ? 'dry-run' : 'apply',
    scanned: rows.length,
    results: [],
  };
  if (txidDiagnostic) report.txidDiagnostic = txidDiagnostic;

  for (const cob of rows) {
    const line = {
      pixCobrancaId: cob.id,
      txid: cob.txid,
      dbStatus: cob.status,
      provider: cob.provider,
      linkedEntityType: cob.linkedEntityType,
    };

    if (!isEfiReconcileEligible(cob)) {
      line.skipped = 'not_reconcile_eligible';
      if (String(cob.provider || '').toUpperCase() !== 'EFI') {
        line.reason = 'provider_not_efi';
      } else if (!ACTIVE.includes(String(cob.status || '').toUpperCase())) {
        line.reason = 'status_not_active';
      } else if (!SUPPORTED_LINKED_TYPES.includes(String(cob.linkedEntityType || ''))) {
        line.reason = 'unsupported_linked_entity_type';
      } else if (!normalizeTxidInput(cob.txid)) {
        line.reason = 'missing_txid';
      }
      report.results.push(line);
      // eslint-disable-next-line no-continue
      continue;
    }

    const resolved = await resolvePaidPixFromEfi(cob, opts.days);
    if (resolved.error) {
      line.efiError = resolved.error;
      line.outcome = 'PENDENTE';
      report.results.push(line);
      // eslint-disable-next-line no-continue
      continue;
    }

    line.efiSummary = resolved.efiSummary;
    line.matchSource = resolved.source;

    if (!resolved.item || !resolved.item.endToEndId) {
      line.outcome = 'PENDENTE';
      line.reason = 'efi_sem_pix_recebido_compativeis';
      report.results.push(line);
      // eslint-disable-next-line no-continue
      continue;
    }

    line.wouldProcess = true;
    line.endToEndIdSuffix = resolved.item.endToEndId
      ? String(resolved.item.endToEndId).slice(-8)
      : null;

    if (opts.dryRun) {
      line.outcome = 'DRY_RUN_OK';
      report.results.push(line);
      // eslint-disable-next-line no-continue
      continue;
    }

    const body = { pix: [resolved.item] };
    const proc = await processEfiPixWebhookBody(body, {
      requestId: `efi-reconcile:${cob.id}`,
      ip: null,
      source: 'recovery',
      requestPath: 'scripts/efi-reconcile-received-pix.js',
      requestMethod: null,
      httpStatus: null,
      receivedAt: new Date(),
    });

    line.process = proc;
    const r0 = proc.results && proc.results[0] ? proc.results[0] : {};
    line.webhookResult = r0.result || null;
    line.settlementResult = r0.settlementResult != null ? r0.settlementResult : undefined;

    if (proc.ok && (r0.result === 'PROCESSED' || r0.result === 'DUPLICATE' || r0.result === 'ALREADY_PAID')) {
      line.outcome = r0.result === 'PROCESSED' ? 'APPLIED' : r0.result;
      await recordAudit({
        userId: cob.userId,
        action: 'efi.pix.reconcile.apply',
        entity: 'PixCobranca',
        entityId: cob.id,
        metadata: {
          txid: cob.txid,
          matchSource: resolved.source,
          webhookResult: r0.result,
          settlementResult: r0.settlementResult || null,
        },
        ip: null,
        userAgent: 'efi-reconcile-received-pix.js',
      });
    } else {
      line.outcome = 'REPROVADO';
    }

    report.results.push(line);
  }

  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((e) => {
    console.error(JSON.stringify({ ok: false, message: e.message }));
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
