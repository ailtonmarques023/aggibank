#!/usr/bin/env node
/**
 * Fase U.5 - Recovery batch controlado de Pix Efi pagos sem webhook.
 *
 * Dry-run e o modo padrao. Use --apply apenas com autorizacao operacional explicita.
 * Este script nao altera saldo diretamente: em apply, reaproveita processEfiPixWebhookBody.
 */
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { prisma } = require('../src/config/database');
const efiPixClient = require('../src/services/efiPixClient');
const { processEfiPixWebhookBody } = require('../src/services/pixEfiWebhookService');
const { recordAudit } = require('../src/utils/auditLog');
const {
  RECONCILE_SUPPORTED_LINKED_TYPES,
  amountsMatchCob,
  normalizeTxidInput,
  pickConfirmedPixFromCobPayload,
  toWebhookPixItem,
} = require('../src/utils/efiReconcilePix');

const SCRIPT_NAME = 'scripts/efi-reconcile-pending-pix-batch.js';
const DEFAULT_LIMIT = 20;
const DEFAULT_MIN_AGE_MINUTES = 5;
const DEFAULT_DAYS = 14;
const MAX_LIMIT = 100;
const PAID_EFI_STATUSES = new Set(['CONCLUIDA', 'PAGA']);

function parsePositiveInt(value, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const n = parseInt(String(value || ''), 10);
  if (!Number.isFinite(n) || n < min) return fallback;
  return Math.min(max, n);
}

function parseArgs(argv = process.argv.slice(2)) {
  const out = {
    dryRun: true,
    apply: false,
    limit: DEFAULT_LIMIT,
    minAgeMinutes: DEFAULT_MIN_AGE_MINUTES,
    linkedType: null,
    txid: null,
    days: DEFAULT_DAYS,
    json: true,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--apply') {
      out.apply = true;
      out.dryRun = false;
    } else if (a === '--dry-run') {
      out.apply = false;
      out.dryRun = true;
    } else if (a === '--json') {
      out.json = true;
    } else if (a === '--txid') {
      out.txid = normalizeTxidInput(argv[i + 1]);
      i += 1;
    } else if (a.startsWith('--txid=')) {
      out.txid = normalizeTxidInput(a.slice('--txid='.length));
    } else if (a === '--linked-type') {
      out.linkedType = String(argv[i + 1] || '').trim();
      i += 1;
    } else if (a.startsWith('--linked-type=')) {
      out.linkedType = String(a.slice('--linked-type='.length) || '').trim();
    } else if (a.startsWith('--limit=')) {
      out.limit = parsePositiveInt(a.slice('--limit='.length), DEFAULT_LIMIT, { min: 1, max: MAX_LIMIT });
    } else if (a.startsWith('--min-age-minutes=')) {
      out.minAgeMinutes = parsePositiveInt(a.slice('--min-age-minutes='.length), DEFAULT_MIN_AGE_MINUTES, {
        min: 0,
        max: 1440,
      });
    } else if (a.startsWith('--days=')) {
      out.days = parsePositiveInt(a.slice('--days='.length), DEFAULT_DAYS, { min: 1, max: 90 });
    }
  }

  return out;
}

function maskSuffix(value, size = 8) {
  const s = String(value || '').trim();
  if (!s) return null;
  return s.length <= size ? `***${s}` : `***${s.slice(-size)}`;
}

function efiSummary(efiCob) {
  if (!efiCob || typeof efiCob !== 'object') return { found: false };
  return {
    found: true,
    status: efiCob.status != null ? String(efiCob.status) : null,
    pixCount: Array.isArray(efiCob.pix) ? efiCob.pix.length : 0,
    valorOriginal: efiCob.valor && efiCob.valor.original != null ? String(efiCob.valor.original) : null,
  };
}

function isEfiCobPaid(efiCob) {
  return PAID_EFI_STATUSES.has(String(efiCob && efiCob.status ? efiCob.status : '').trim().toUpperCase());
}

function hasReceivedPixForTxid(efiCob, txid) {
  if (!efiCob || !Array.isArray(efiCob.pix)) return false;
  const want = String(txid || '').trim();
  return efiCob.pix.some((p) => {
    if (!p || typeof p !== 'object') return false;
    const e2e = p.endToEndId != null ? String(p.endToEndId).trim() : '';
    if (!e2e) return false;
    const pTxid = p.txid != null ? String(p.txid).trim() : '';
    return !pTxid || !want || pTxid === want;
  });
}

function increment(report, key) {
  report[key] += 1;
}

function baseLine(cob) {
  return {
    pixCobrancaId: cob.id,
    txidSuffix: maskSuffix(cob.txid),
    dbStatus: cob.status || null,
    provider: cob.provider || null,
    linkedEntityType: cob.linkedEntityType || null,
  };
}

function mark(line, report, counter, reason, extra = {}) {
  Object.assign(line, extra, { reason });
  increment(report, counter);
  report.results.push(line);
  return line;
}

function isOlderThanMinAge(cob, minAgeMinutes, now = new Date()) {
  if (!cob.createdAt) return false;
  const created = new Date(cob.createdAt);
  if (Number.isNaN(created.getTime())) return false;
  const cutoff = now.getTime() - minAgeMinutes * 60000;
  return created.getTime() <= cutoff;
}

function validateLocalEligibility(cob, opts, now = new Date()) {
  if (String(cob.provider || '').trim().toUpperCase() !== 'EFI') return 'UNSUPPORTED_ENTITY';
  if (String(cob.status || '').trim().toUpperCase() === 'PAGA') return 'ALREADY_PAID';
  if (String(cob.status || '').trim().toUpperCase() !== 'ATIVA') return 'UNSUPPORTED_ENTITY';
  if (!normalizeTxidInput(cob.txid)) return 'UNSUPPORTED_ENTITY';
  if (!RECONCILE_SUPPORTED_LINKED_TYPES.includes(String(cob.linkedEntityType || '').trim())) {
    return 'UNSUPPORTED_ENTITY';
  }
  if (opts.linkedType && String(cob.linkedEntityType || '').trim() !== opts.linkedType) {
    return 'UNSUPPORTED_ENTITY';
  }
  if (!isOlderThanMinAge(cob, opts.minAgeMinutes, now)) return 'EFI_PENDING';
  return null;
}

async function listEligiblePixCobrancas(opts, db = prisma, now = new Date()) {
  const select = {
    id: true,
    userId: true,
    txid: true,
    status: true,
    amount: true,
    provider: true,
    linkedEntityType: true,
    linkedEntityId: true,
    createdAt: true,
  };

  if (opts.txid) {
    const one = await db.pixCobranca.findUnique({ where: { txid: opts.txid }, select });
    return one ? [one] : [];
  }

  const cutoff = new Date(now.getTime() - opts.minAgeMinutes * 60000);
  const linkedTypes = opts.linkedType ? [opts.linkedType] : Array.from(RECONCILE_SUPPORTED_LINKED_TYPES);
  return db.pixCobranca.findMany({
    where: {
      provider: 'EFI',
      status: 'ATIVA',
      linkedEntityType: { in: linkedTypes },
      // PixCobranca.txid e campo String obrigatorio no schema; Prisma rejeita `not: null`
      // neste filtro. Exclui apenas txid vazio, se existir dado legado inconsistente.
      txid: { not: '' },
      createdAt: { lte: cutoff },
    },
    orderBy: { createdAt: 'asc' },
    take: opts.limit,
    select,
  });
}

async function resolveEfiPayment(cob, client = efiPixClient) {
  const efiCob = await client.getCobByTxid(cob.txid);
  if (!efiCob) {
    return { reason: 'EFI_NOT_FOUND', efiSummary: { found: false }, item: null };
  }

  const summary = efiSummary(efiCob);
  if (!isEfiCobPaid(efiCob)) {
    return { reason: 'EFI_PENDING', efiSummary: summary, item: null };
  }

  const compatible = pickConfirmedPixFromCobPayload(cob, efiCob);
  if (!compatible) {
    if (hasReceivedPixForTxid(efiCob, cob.txid)) {
      return { reason: 'AMOUNT_MISMATCH', efiSummary: summary, item: null };
    }
    return { reason: 'EFI_PENDING', efiSummary: summary, item: null };
  }

  if (!amountsMatchCob(cob.amount, compatible.valor)) {
    return { reason: 'AMOUNT_MISMATCH', efiSummary: summary, item: null };
  }

  const item = toWebhookPixItem(compatible, cob.txid);
  if (!item.endToEndId) {
    return { reason: 'EFI_PENDING', efiSummary: summary, item: null };
  }
  return { reason: 'APPLIED', efiSummary: summary, item };
}

function initialReport(opts) {
  return {
    ok: true,
    mode: opts.dryRun ? 'dry-run' : 'apply',
    scanned: 0,
    pending: 0,
    applied: 0,
    skipped: 0,
    errors: 0,
    criteria: {
      provider: 'EFI',
      status: 'ATIVA',
      minAgeMinutes: opts.minAgeMinutes,
      limit: opts.limit,
      linkedType: opts.linkedType || null,
      txidSuffix: opts.txid ? maskSuffix(opts.txid) : null,
    },
    results: [],
  };
}

async function applyConfirmedPix(cob, item, deps) {
  const proc = await deps.processEfiPixWebhookBody(
    { pix: [item] },
    {
      requestId: `efi-pix-recovery-batch:${cob.id}`,
      ip: null,
      source: 'recovery',
      requestPath: SCRIPT_NAME,
      requestMethod: null,
      httpStatus: null,
      receivedAt: new Date(),
    },
  );
  const r0 = proc.results && proc.results[0] ? proc.results[0] : {};
  return { proc, firstResult: r0 };
}

async function runRecoveryBatch(options = {}, deps = {}) {
  const opts = {
    ...parseArgs([]),
    ...options,
  };
  opts.linkedType = opts.linkedType ? String(opts.linkedType).trim() : null;
  opts.txid = normalizeTxidInput(opts.txid);
  opts.dryRun = opts.apply ? false : opts.dryRun !== false;

  const db = deps.prisma || prisma;
  const client = deps.efiPixClient || efiPixClient;
  const processWebhook = deps.processEfiPixWebhookBody || processEfiPixWebhookBody;
  const audit = deps.recordAudit || recordAudit;
  const now = deps.now || new Date();
  const report = initialReport(opts);

  if (opts.linkedType && !RECONCILE_SUPPORTED_LINKED_TYPES.includes(opts.linkedType)) {
    report.ok = false;
    mark({ linkedEntityType: opts.linkedType }, report, 'skipped', 'UNSUPPORTED_ENTITY', {
      linkedEntityType: opts.linkedType,
      outcome: 'SKIPPED',
    });
    return report;
  }

  if (typeof client.isEfiPixConfigured === 'function' && !client.isEfiPixConfigured()) {
    report.ok = false;
    report.code = 'EFI_NOT_CONFIGURED';
    return report;
  }

  const rows = await listEligiblePixCobrancas(opts, db, now);
  report.scanned = rows.length;

  if (opts.txid && rows.length === 0) {
    report.txidDiagnostic = { outcome: 'TXID_NOT_FOUND', txidSuffix: maskSuffix(opts.txid) };
  }

  for (const cob of rows) {
    const line = baseLine(cob);
    const localReason = validateLocalEligibility(cob, opts, now);
    if (localReason) {
      const counter = localReason === 'EFI_PENDING' ? 'pending' : 'skipped';
      mark(line, report, counter, localReason, { outcome: 'SKIPPED' });
      // eslint-disable-next-line no-continue
      continue;
    }

    let resolved;
    try {
      resolved = await resolveEfiPayment(cob, client);
    } catch (e) {
      mark(line, report, 'errors', 'ERROR', {
        outcome: 'ERROR',
        message: 'Falha ao consultar Efi',
      });
      // eslint-disable-next-line no-continue
      continue;
    }

    line.efiSummary = resolved.efiSummary;

    if (!resolved.item) {
      const counter = resolved.reason === 'EFI_PENDING' ? 'pending' : 'skipped';
      mark(line, report, counter, resolved.reason, { outcome: 'SKIPPED' });
      // eslint-disable-next-line no-continue
      continue;
    }

    line.endToEndIdSuffix = maskSuffix(resolved.item.endToEndId);
    line.wouldApply = true;

    if (opts.dryRun) {
      mark(line, report, 'pending', 'APPLIED', { outcome: 'DRY_RUN_APPLY_READY' });
      // eslint-disable-next-line no-continue
      continue;
    }

    try {
      const { proc, firstResult } = await applyConfirmedPix(cob, resolved.item, {
        processEfiPixWebhookBody: processWebhook,
      });
      line.webhookResult = firstResult.result || null;
      line.settlementResult = firstResult.settlementResult || null;

      if (proc.ok && firstResult.result === 'PROCESSED') {
        line.outcome = 'APPLIED';
        line.reason = 'APPLIED';
        increment(report, 'applied');
        report.results.push(line);
        await audit({
          userId: cob.userId,
          action: 'efi.pix.recovery_batch.apply',
          entity: 'PixCobranca',
          entityId: cob.id,
          metadata: {
            txidSuffix: maskSuffix(cob.txid),
            endToEndIdSuffix: maskSuffix(resolved.item.endToEndId),
            settlementResult: firstResult.settlementResult || null,
            requestPath: SCRIPT_NAME,
          },
          ip: null,
          userAgent: SCRIPT_NAME,
        });
      } else if (proc.ok && (firstResult.result === 'DUPLICATE' || firstResult.result === 'ALREADY_PAID')) {
        mark(line, report, 'skipped', 'ALREADY_PAID', { outcome: 'SKIPPED' });
      } else {
        mark(line, report, 'errors', 'ERROR', { outcome: 'ERROR' });
      }
    } catch (e) {
      mark(line, report, 'errors', 'ERROR', {
        outcome: 'ERROR',
        message: 'Falha ao aplicar recovery',
      });
    }
  }

  return report;
}

async function main() {
  const opts = parseArgs();
  const report = await runRecoveryBatch(opts);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}

if (require.main === module) {
  main()
    .catch(() => {
      console.error(JSON.stringify({ ok: false, reason: 'ERROR', message: 'Falha ao executar recovery batch' }));
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

module.exports = {
  SCRIPT_NAME,
  parseArgs,
  maskSuffix,
  isEfiCobPaid,
  listEligiblePixCobrancas,
  resolveEfiPayment,
  runRecoveryBatch,
};
