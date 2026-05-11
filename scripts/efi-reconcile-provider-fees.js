#!/usr/bin/env node
'use strict';

/**
 * Fase S.4 — Conciliação financeira Efí: preenche `providerFeeAmount` e `netAmount` em `PixCobranca`
 * usando o Extrato de Conciliação API Pix (POST/GET /v2/gn/relatorios/*), layout CSV v4.0.
 *
 * Fonte: documentação Efí — `POST /v2/gn/relatorios/extrato-conciliacao` + `GET /v2/gn/relatorios/:id`.
 * Requer escopos `gn.reports.write` e `gn.reports.read` na aplicação Efí.
 *
 * Uso:
 *   node scripts/efi-reconcile-provider-fees.js --dry-run
 *   node scripts/efi-reconcile-provider-fees.js --dry-run --date=2026-05-11
 *   node scripts/efi-reconcile-provider-fees.js --dry-run --txid=SEU_TXID
 *   node scripts/efi-reconcile-provider-fees.js --apply --date=2026-05-11
 *
 * Padrão: --dry-run (não grava no banco).
 * Não imprime segredos, certificado, pixCopiaECola nem JWT.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { prisma } = require('../src/config/database');
const efiPixClient = require('../src/services/efiPixClient');
const { matchPrAndTprForCob, extractGrossFeeNetFromMatch } = require('../src/utils/efiExtratoConciliacaoCsv');
const { recordAudit } = require('../src/utils/auditLog');

function maskTxid(t) {
  const s = String(t || '');
  if (s.length <= 8) return '***';
  return `${s.slice(0, 3)}…${s.slice(-4)}`;
}

function movementDateKeySaoPaulo(d) {
  if (!d || !(d instanceof Date) || Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
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

  const rows = await prisma.pixCobranca.findMany({
    where: {
      status: 'PAGA',
      provider: 'EFI',
      providerFeeAmount: null,
      ...(opts.txid ? { txid: opts.txid } : {}),
    },
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

  const filtered = opts.date
    ? rows.filter((r) => r.paidAt && movementDateKeySaoPaulo(r.paidAt) === opts.date)
    : rows;

  const report = {
    ok: true,
    mode: opts.dryRun ? 'dry-run' : 'apply',
    scanned: filtered.length,
    results: [],
  };

  const csvCache = new Map();

  for (const cob of filtered) {
    const line = {
      pixCobrancaId: cob.id,
      txidMask: maskTxid(cob.txid),
      paidAt: cob.paidAt ? cob.paidAt.toISOString() : null,
    };

    const movDate = cob.paidAt ? movementDateKeySaoPaulo(cob.paidAt) : null;
    if (!movDate) {
      line.outcome = 'SKIPPED';
      line.code = 'MISSING_PAID_AT';
      report.results.push(line);
      // eslint-disable-next-line no-continue
      continue;
    }

    try {
      if (!csvCache.has(movDate)) {
        const post = await efiPixClient.postExtratoConciliacao({ dataMovimento: movDate });
        const rid = post && post.id != null ? String(post.id).trim() : '';
        if (!rid) {
          line.outcome = 'ERROR';
          line.code = 'EXTRATO_NO_ID';
          line.post = { status: post && post.status ? String(post.status) : null };
          report.results.push(line);
          // eslint-disable-next-line no-continue
          continue;
        }
        const dl = await efiPixClient.downloadRelatorioById(rid, { maxWaitMs: 120000, pollMs: 5000 });
        if (!dl.ok || !dl.csv) {
          line.outcome = 'ERROR';
          line.code = dl.code || 'EXTRATO_DOWNLOAD_FAILED';
          line.httpStatus = dl.status;
          report.results.push(line);
          // eslint-disable-next-line no-continue
          continue;
        }
        csvCache.set(movDate, dl.csv);
      }

      const csvText = csvCache.get(movDate);
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
        // eslint-disable-next-line no-continue
        continue;
      }

      const amounts = extractGrossFeeNetFromMatch(m);
      if (!amounts || amounts.fee == null) {
        line.outcome = 'NO_FEE_ROW';
        line.code = m.code === 'NO_TPR' ? 'NO_TPR' : 'NO_FEE_VALUE';
        report.results.push(line);
        // eslint-disable-next-line no-continue
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
        // eslint-disable-next-line no-continue
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
          movementDate: movDate,
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
