#!/usr/bin/env node
'use strict';

/**
 * Fase S.4 — Conciliação financeira Efí: preenche `providerFeeAmount` e `netAmount` em `PixCobranca`
 * usando o Extrato de Conciliação API Pix (POST/GET /v2/gn/relatorios/*), layout CSV v4.0.
 *
 * `dataMovimento` enviado à Efí:
 * - Com `--date=AAAA-MM-DD`: usa **exatamente** esse dia (não deriva de `paidAt`).
 * - Sem `--date`: deriva de `paidAt` em **America/Sao_Paulo** por cobrança.
 * - A Efí exige data **anterior** ao dia corrente em SP; o script valida antes da chamada (`DATE_NOT_AVAILABLE_YET`).
 *
 * Uso:
 *   node scripts/efi-reconcile-provider-fees.js --dry-run
 *   node scripts/efi-reconcile-provider-fees.js --dry-run --date=2026-05-10
 *   node scripts/efi-reconcile-provider-fees.js --dry-run --txid=SEU_TXID
 *   node scripts/efi-reconcile-provider-fees.js --dry-run --date=2026-05-10 --txid=SEU_TXID
 *   node scripts/efi-reconcile-provider-fees.js --apply --date=2026-05-10
 *
 * Padrão: --dry-run (não grava no banco).
 * Não imprime segredos, certificado, pixCopiaECola nem JWT.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { prisma } = require('../src/config/database');
const efiPixClient = require('../src/services/efiPixClient');
const { matchPrAndTprForCob, extractGrossFeeNetFromMatch } = require('../src/utils/efiExtratoConciliacaoCsv');
const {
  saoPauloDateKey,
  todaySaoPauloDateKey,
  resolveDataMovimento,
  validateDataMovimentoBeforeExtrato,
} = require('../src/utils/efiReconcileFeeExtratoDate');
const { recordAudit } = require('../src/utils/auditLog');

function maskTxid(t) {
  const s = String(t || '');
  if (s.length <= 8) return '***';
  return `${s.slice(0, 3)}…${s.slice(-4)}`;
}

function parseArgs() {
  const out = { dryRun: true, txid: null, date: null, limit: 30 };
  for (const a of process.argv.slice(2)) {
    if (a === '--apply') out.dryRun = false;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a.startsWith('--txid=')) out.txid = a.slice('--txid='.length).trim();
    else if (a.startsWith('--date=')) out.date = a.slice('--date='.length).trim();
    else if (a.startsWith('--limit=')) {
      out.limit = Math.min(100, Math.max(1, parseInt(a.slice('--limit='.length), 10) || 30));
    }
  }
  return out;
}

async function fetchExtratoCsvIntoCache(csvCache, dataMovimento) {
  const post = await efiPixClient.postExtratoConciliacao({ dataMovimento });
  const rid = post && post.id != null ? String(post.id).trim() : '';
  if (!rid) {
    return { ok: false, code: 'EXTRATO_NO_ID', post: { status: post && post.status ? String(post.status) : null } };
  }
  const dl = await efiPixClient.downloadRelatorioById(rid, { maxWaitMs: 120000, pollMs: 5000 });
  if (!dl.ok || !dl.csv) {
    return { ok: false, code: dl.code || 'EXTRATO_DOWNLOAD_FAILED', httpStatus: dl.status };
  }
  csvCache.set(dataMovimento, dl.csv);
  return { ok: true };
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

  if (!efiPixClient.isProductionPixAllowed()) {
    console.error(
      JSON.stringify({
        ok: false,
        code: 'EFI_EXTRATO_PRODUCTION_REQUIRED',
        message:
          'Extrato de conciliação Efí exige produção habilitada (EFI_ENVIRONMENT=production + EFI_PIX_ENABLE_PRODUCTION=true). Sandbox não é suportado para esta rotina.',
      }),
    );
    process.exit(2);
  }

  if (opts.date) {
    const chk = validateDataMovimentoBeforeExtrato(opts.date);
    if (!chk.ok) {
      console.error(
        JSON.stringify({
          ok: false,
          code: chk.code,
          message:
            chk.code === 'DATE_NOT_AVAILABLE_YET'
              ? 'dataMovimento deve ser anterior ao dia corrente em America/Sao_Paulo (regra Efí). Nenhuma chamada à API Efí foi feita.'
              : 'Formato de data inválido; use AAAA-MM-DD.',
          dataMovimentoRequested: opts.date,
          dataMovimentoUsed: opts.date,
          todaySaoPaulo: chk.todaySaoPaulo,
        }),
      );
      process.exit(3);
    }
  }

  const where = {
    status: 'PAGA',
    provider: 'EFI',
    providerFeeAmount: null,
    ...(opts.txid ? { txid: opts.txid } : {}),
  };

  const rows = await prisma.pixCobranca.findMany({
    where,
    orderBy: { paidAt: 'desc' },
    take: opts.limit,
    select: {
      id: true,
      userId: true,
      txid: true,
      endToEndId: true,
      grossAmount: true,
      amount: true,
      paidAt: true,
    },
  });

  let filtered;
  if (opts.date && opts.txid) {
    // `--date` força o dia do extrato na Efí; `--txid` seleciona a cobrança (sem exigir paidAt no mesmo dia).
    filtered = rows;
  } else if (opts.date) {
    filtered = rows.filter((r) => r.paidAt && saoPauloDateKey(r.paidAt) === opts.date);
  } else {
    filtered = rows;
  }

  const todaySp = todaySaoPauloDateKey();

  const report = {
    ok: true,
    mode: opts.dryRun ? 'dry-run' : 'apply',
    todaySaoPaulo: todaySp,
    /** Valor de `--date` quando informado; define o `dataMovimento` do POST na Efí para todas as linhas. */
    dataMovimentoExplicitArg: opts.date || null,
    /**
     * Resumo do `dataMovimento` enviado à Efí: com `--date`, é o próprio argumento; sem `--date`, varia por linha (`results[].dataMovimentoUsed`).
     */
    dataMovimentoSentToEfiSummary: opts.date
      ? { type: 'fixed', value: opts.date }
      : { type: 'per_row_from_paid_at_sao_paulo', see: 'results[].dataMovimentoUsed' },
    dataMovimentoResolution: opts.date
      ? 'explicit_arg (POST extrato usa exatamente --date)'
      : 'from_paid_at_per_row (POST extrato usa dia SP de paidAt)',
    scanned: filtered.length,
    results: [],
  };

  const csvCache = new Map();

  if (opts.date && filtered.length > 0) {
    const fetchRes = await fetchExtratoCsvIntoCache(csvCache, opts.date);
    if (!fetchRes.ok) {
      report.ok = false;
      report.code = fetchRes.code;
      report.dataMovimentoUsed = opts.date;
      if (fetchRes.post) report.post = fetchRes.post;
      if (fetchRes.httpStatus != null) report.httpStatus = fetchRes.httpStatus;
      console.log(JSON.stringify(report, null, 2));
      process.exit(4);
    }
  }

  for (const cob of filtered) {
    const paidAtSp = cob.paidAt ? saoPauloDateKey(cob.paidAt) : null;
    const dataMovimentoForApi = resolveDataMovimento({
      explicitDate: opts.date,
      paidAt: cob.paidAt,
    });

    const line = {
      pixCobrancaId: cob.id,
      txidMask: maskTxid(cob.txid),
      paidAt: cob.paidAt ? cob.paidAt.toISOString() : null,
      paidAtSaoPaulo: paidAtSp,
      dataMovimentoUsed: dataMovimentoForApi,
      dataMovimentoResolution: opts.date ? 'explicit_arg' : 'from_paid_at',
    };

    if (!dataMovimentoForApi) {
      line.outcome = 'SKIPPED';
      line.code = 'MISSING_PAID_AT_OR_DATE';
      report.results.push(line);
      continue;
    }

    if (!opts.date) {
      const chk = validateDataMovimentoBeforeExtrato(dataMovimentoForApi);
      if (!chk.ok) {
        line.outcome = 'SKIPPED';
        line.code = chk.code;
        line.todaySaoPaulo = chk.todaySaoPaulo;
        report.results.push(line);
        continue;
      }
    }

    try {
      if (!csvCache.has(dataMovimentoForApi)) {
        const fetchRes = await fetchExtratoCsvIntoCache(csvCache, dataMovimentoForApi);
        if (!fetchRes.ok) {
          line.outcome = 'ERROR';
          line.code = fetchRes.code || 'EXTRATO_FETCH_FAILED';
          if (fetchRes.post) line.post = fetchRes.post;
          if (fetchRes.httpStatus != null) line.httpStatus = fetchRes.httpStatus;
          report.results.push(line);
          continue;
        }
      }

      const csvText = csvCache.get(dataMovimentoForApi);
      const cobForMatch = {
        txid: cob.txid,
        endToEndId: cob.endToEndId,
        grossAmount: cob.grossAmount != null ? Number(cob.grossAmount) : null,
        amount: cob.amount != null ? Number(cob.amount) : null,
      };

      const m = matchPrAndTprForCob(cobForMatch, csvText);
      line.matchCode = m.code;

      if (!m.ok) {
        if (m.code === 'AMBIGUOUS_PR' || m.code === 'AMBIGUOUS_TPR') {
          line.outcome = 'AMBIGUOUS_MATCH';
        } else {
          line.outcome = 'NO_MATCH';
        }
        line.code = m.code;
        report.results.push(line);
        continue;
      }

      const amounts = extractGrossFeeNetFromMatch(m);
      if (!amounts || amounts.fee == null) {
        line.outcome = 'NO_FEE_ROW';
        line.code = m.code === 'NO_TPR' ? 'NO_TPR' : 'NO_FEE_VALUE';
        report.results.push(line);
        continue;
      }

      line.wouldSet = {
        providerFeeAmount: amounts.fee,
        netAmount: amounts.net,
        providerFeeCurrency: 'BRL',
        providerFeeSource: 'efi_financial_report',
      };

      if (opts.dryRun) {
        line.outcome = 'DRY_RUN_OK';
        report.results.push(line);
        continue;
      }

      await prisma.pixCobranca.update({
        where: { id: cob.id },
        data: {
          providerFeeAmount: amounts.fee,
          netAmount: amounts.net,
          providerFeeCurrency: 'BRL',
          providerFeeSource: 'efi_financial_report',
          providerFeeCapturedAt: new Date(),
        },
      });

      await recordAudit({
        userId: cob.userId,
        action: 'efi.pix.provider_fee.reconciled',
        entity: 'PixCobranca',
        entityId: cob.id,
        metadata: {
          dataMovimentoUsed: dataMovimentoForApi,
          providerFeeAmount: amounts.fee,
          netAmount: amounts.net,
          matchCode: m.code,
        },
        ip: null,
        userAgent: 'efi-reconcile-provider-fees.js',
      });

      line.outcome = 'APPLIED';
      report.results.push(line);
    } catch (e) {
      line.outcome = 'ERROR';
      line.message = e.message;
      report.results.push(line);
    }
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
