#!/usr/bin/env node
/**
 * Fase O.2 — Verificação somente leitura: PixCobranca + PixWebhookEvent (produção via `railway run`).
 * Não cria cobrança, não atualiza, não deleta, não settlement.
 */
'use strict';

const { PrismaClient } = require('@prisma/client');

const REPROVADO_RESULTS = new Set(['ORPHAN_TXID', 'AMOUNT_MISMATCH']);

function matchesCobranca(cob, ev) {
  if (cob.endToEndId && ev.endToEndId && cob.endToEndId === ev.endToEndId) return true;
  if (cob.txid && ev.txid && cob.txid === ev.txid) return true;
  return false;
}

function verdict(cobrancas, events) {
  const badEvents = events.filter((e) => REPROVADO_RESULTS.has(e.processingResult));
  if (badEvents.length > 0) {
    return {
      status: 'REPROVADO',
      reason: 'evento_com_resultado_critico',
      samples: badEvents.slice(0, 5).map((e) => ({ id: e.id, processingResult: e.processingResult, txid: e.txid })),
    };
  }

  const aprovado = cobrancas.some(
    (c) =>
      c.status === 'PAGA' &&
      c.paidAt != null &&
      c.endToEndId &&
      events.some((e) => e.processingResult === 'PROCESSED' && matchesCobranca(c, e)),
  );
  if (aprovado) {
    return { status: 'APROVADO', reason: 'cobranca_paga_paidAt_e2e_e_evento_processado' };
  }

  const onlyAtiva = cobrancas.length > 0 && cobrancas.every((c) => c.status === 'ATIVA');
  const noEvents = events.length === 0;
  if ((onlyAtiva || cobrancas.length === 0) && noEvents) {
    return { status: 'PENDENTE', reason: 'sem_paga_ou_sem_eventos' };
  }

  const paga = cobrancas.filter((c) => c.status === 'PAGA');
  if (paga.length > 0 && !events.some((e) => e.processingResult === 'PROCESSED')) {
    return { status: 'PENDENTE', reason: 'paga_sem_evento_processed_na_amostra' };
  }

  return { status: 'PENDENTE', reason: 'cenario_misto_revisar_manualmente' };
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const cobrancas = await prisma.pixCobranca.findMany({
      orderBy: { createdAt: 'desc' },
      take: 25,
      select: {
        id: true,
        txid: true,
        status: true,
        amount: true,
        createdAt: true,
        paidAt: true,
        endToEndId: true,
      },
    });

    const events = await prisma.pixWebhookEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: 40,
      select: {
        id: true,
        txid: true,
        endToEndId: true,
        processingResult: true,
        pixCobrancaId: true,
        createdAt: true,
      },
    });

    const out = {
      fase: 'O.2',
      modo: 'read_only',
      cobrancas: cobrancas.map((c) => ({
        ...c,
        amount: c.amount != null ? String(c.amount) : null,
      })),
      pix_webhook_events: events,
      verdicto: verdict(cobrancas, events),
    };

    console.log(JSON.stringify(out, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, message: e.message }));
  process.exit(1);
});
