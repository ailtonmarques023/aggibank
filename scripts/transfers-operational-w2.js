#!/usr/bin/env node
'use strict';

/**
 * Fase W.2 — Transferência interna REAL controlada de R$ 1,00.
 *
 * Pré-requisitos (ambiente):
 *   AGILBANK_W2_SENDER_TOKEN   JWT do remetente (com ou sem prefixo Bearer)
 *   AGILBANK_W2_RECIPIENT_TO   E-mail cadastrado ou conta-dígito do destinatário
 *   AGILBANK_W2_API_BASE       Opcional; default: https://aggibank-production.up.railway.app/api
 *
 * Opcional:
 *   AGILBANK_W2_RECIPIENT_TOKEN  JWT do destinatário (extrato via API sem Prisma)
 *   AGILBANK_W2_IDEMPOTENCY_KEY  Fixa a chave (default: UUID novo a cada execução)
 *   DATABASE_URL                 Se definida e conectável, habilita checagens no banco (somente leitura + contagens)
 *
 * Saída: JSON no stdout; exit 0 = aprovado operacionalmente; 1 = reprovado; 2 = pendente (env incompleto).
 */

require('dotenv').config();

const crypto = require('crypto');
const { prisma } = require('../src/config/database');
const { findUserByTo } = require('../src/services/internalTransferService');

const AMOUNT = 1;
const DESCRIPTION = 'Teste operacional transferência interna W.2';

function normalizeApiBase(u) {
  const raw = String(u || process.env.AGILBANK_API_BASE || '').trim() || 'https://aggibank-production.up.railway.app/api';
  const s = raw.replace(/\/$/, '');
  return s.endsWith('/api') ? s : `${s}/api`;
}

function bearer(raw) {
  const t = String(raw || '').trim();
  if (!t) return '';
  return t.toLowerCase().startsWith('bearer ') ? t : `Bearer ${t}`;
}

function money(n) {
  if (n == null || n === '') return null;
  return Number(n);
}

async function apiJson(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch (_) {
    body = { parseError: true, _rawLen: text ? text.length : 0 };
  }
  return { res, body };
}

async function getProfile(apiBase, token) {
  return apiJson(`${apiBase}/user/profile`, {
    headers: { Authorization: bearer(token) },
  });
}

async function postInternalTransfer(apiBase, token, payload, idemKey) {
  return apiJson(`${apiBase}/transfers/internal`, {
    method: 'POST',
    headers: {
      Authorization: bearer(token),
      'Idempotency-Key': idemKey,
    },
    body: JSON.stringify(payload),
  });
}

async function getStatement(apiBase, token, limit = 50) {
  return apiJson(`${apiBase}/user/statement?limit=${limit}`, {
    headers: { Authorization: bearer(token) },
  });
}

function assertDelta(before, after, expectedDelta) {
  const b = money(before);
  const a = money(after);
  if (!Number.isFinite(b) || !Number.isFinite(a)) {
    return { ok: false, reason: 'saldo_nao_numerico', before: b, after: a };
  }
  const diff = Math.round((a - b) * 100) / 100;
  return { ok: diff === expectedDelta, diff, expected: expectedDelta, before: b, after: a };
}

async function tryPrismaRead() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (_) {
    return false;
  }
}

async function snapshotCounts(senderId, recipientId) {
  const uids = [senderId, recipientId];
  const [sender, recipient, itCount, movCount, notifCount] = await Promise.all([
    prisma.user.findUnique({
      where: { id: senderId },
      select: { id: true, email: true, isVerificado: true, saldoAtual: true },
    }),
    prisma.user.findUnique({
      where: { id: recipientId },
      select: { id: true, email: true, isVerificado: true, saldoAtual: true },
    }),
    prisma.internalTransfer.count({
      where: {
        OR: [{ fromUserId: { in: uids } }, { toUserId: { in: uids } }],
      },
    }),
    prisma.movimentacao.count({ where: { userId: { in: uids } } }),
    prisma.notificacao.count({ where: { userId: { in: uids } } }),
  ]);
  return { sender, recipient, itCount, movCount, notifCount };
}

async function main() {
  const report = {
    fase: 'W.2',
    amountBrl: AMOUNT,
    description: DESCRIPTION,
    timestamp: new Date().toISOString(),
    apiBase: normalizeApiBase(process.env.AGILBANK_W2_API_BASE),
    checks: {},
    pendencias: [],
    erros: [],
  };

  const senderToken = process.env.AGILBANK_W2_SENDER_TOKEN;
  const recipientTo = String(process.env.AGILBANK_W2_RECIPIENT_TO || '').trim();
  const recipientToken = process.env.AGILBANK_W2_RECIPIENT_TOKEN;
  const idempotencyKey =
    String(process.env.AGILBANK_W2_IDEMPOTENCY_KEY || '').trim() || `w2-real-${crypto.randomUUID()}`;

  if (!senderToken || !recipientTo) {
    report.pendencias.push('Defina AGILBANK_W2_SENDER_TOKEN e AGILBANK_W2_RECIPIENT_TO.');
    console.log(JSON.stringify(report, null, 2));
    process.exit(2);
  }

  const apiBase = report.apiBase;
  const hasDb = await tryPrismaRead();

  const profSend0 = await getProfile(apiBase, senderToken);
  if (!profSend0.res.ok || !profSend0.body.success || !profSend0.body.data || !profSend0.body.data.user) {
    report.erros.push({
      etapa: 'GET /user/profile remetente',
      status: profSend0.res.status,
      body: profSend0.body && profSend0.body.code ? profSend0.body.code : undefined,
    });
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  const senderUser = profSend0.body.data.user;
  report.checks.senderExists = true;
  report.checks.senderVerified = !!senderUser.isVerificado;
  if (!senderUser.isVerificado) {
    report.erros.push('Remetente não verificado (isVerificado=false).');
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  const saldoSenderApiBefore = money(senderUser.saldoAtual);
  if (!Number.isFinite(saldoSenderApiBefore) || saldoSenderApiBefore < AMOUNT) {
    report.erros.push(`Saldo insuficiente no remetente para R$ ${AMOUNT.toFixed(2)} (API).`);
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  let recipientRow = null;
  /** @type {{ itCount: number, movCount: number, notifCount: number } | null} */
  let snapBeforeCounts = null;
  if (hasDb) {
    recipientRow = await findUserByTo(recipientTo);
    if (!recipientRow) {
      report.pendencias.push('Destinatário não encontrado no banco para o valor de AGILBANK_W2_RECIPIENT_TO.');
      await prisma.$disconnect().catch(() => {});
      console.log(JSON.stringify(report, null, 2));
      process.exit(2);
    }
    report.checks.recipientExists = true;
    report.checks.recipientDifferentFromSender = recipientRow.id !== senderUser.id;
    if (recipientRow.id === senderUser.id) {
      report.erros.push('Destinatário igual ao remetente.');
      await prisma.$disconnect().catch(() => {});
      console.log(JSON.stringify(report, null, 2));
      process.exit(1);
    }

    const recFull = await prisma.user.findUnique({
      where: { id: recipientRow.id },
      select: { id: true, isVerificado: true, saldoAtual: true, email: true },
    });
    report.checks.recipientVerified = !!(recFull && recFull.isVerificado);
    if (!recFull || !recFull.isVerificado) {
      report.erros.push('Destinatário não verificado.');
      await prisma.$disconnect().catch(() => {});
      console.log(JSON.stringify(report, null, 2));
      process.exit(1);
    }

    const snapBefore = await snapshotCounts(senderUser.id, recipientRow.id);
    snapBeforeCounts = { itCount: snapBefore.itCount, movCount: snapBefore.movCount, notifCount: snapBefore.notifCount };
    report.before = {
      senderSaldoDb: money(snapBefore.sender && snapBefore.sender.saldoAtual),
      recipientSaldoDb: money(snapBefore.recipient && snapBefore.recipient.saldoAtual),
      internalTransferCountScope: snapBefore.itCount,
      movimentacaoCountScope: snapBefore.movCount,
      notificacaoCountScope: snapBefore.notifCount,
    };
  } else {
    report.pendencias.push(
      'DATABASE_URL indisponível: contagens e saldos via Prisma antes/depois não foram executados; use AGILBANK_W2_RECIPIENT_TOKEN para validar extrato/lado destinatário via API.'
    );
  }

  let profRecApiBefore = null;
  if (!hasDb && recipientToken) {
    const pr = await getProfile(apiBase, recipientToken);
    if (!pr.res.ok || !pr.body.success || !pr.body.data || !pr.body.data.user) {
      report.erros.push({ etapa: 'GET /user/profile destinatário', status: pr.res.status });
      console.log(JSON.stringify(report, null, 2));
      process.exit(1);
    }
    const ru = pr.body.data.user;
    profRecApiBefore = money(ru.saldoAtual);
    report.checks.recipientRecipientTokenVerified = !!ru.isVerificado;
    report.checks.recipientDifferentFromSender =
      String(ru.id) !== String(senderUser.id);
    if (!ru.isVerificado) {
      report.erros.push('Destinatário (token) não verificado.');
      console.log(JSON.stringify(report, null, 2));
      process.exit(1);
    }
    if (ru.id === senderUser.id) {
      report.erros.push('Token do destinatário aponta para o mesmo usuário do remetente.');
      console.log(JSON.stringify(report, null, 2));
      process.exit(1);
    }
    report.beforeApiOnly = { recipientSaldo: profRecApiBefore };
  }

  const post1 = await postInternalTransfer(
    apiBase,
    senderToken,
    { to: recipientTo, amount: AMOUNT, description: DESCRIPTION },
    idempotencyKey
  );

  report.firstPost = { httpStatus: post1.res.status };
  if (!post1.res.ok || !post1.body.success || !post1.body.data || !post1.body.data.transfer) {
    report.erros.push({
      etapa: 'POST /transfers/internal (1ª)',
      status: post1.res.status,
      code: post1.body && post1.body.code,
      message: post1.body && post1.body.message,
    });
    if (hasDb) await prisma.$disconnect().catch(() => {});
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  if (post1.body.data.replay) {
    report.erros.push('Primeira resposta não deveria ser replay; Idempotency-Key já usada para conclusão anterior.');
    if (hasDb) await prisma.$disconnect().catch(() => {});
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  const transferId = post1.body.data.transfer.id;
  report.transferId = transferId;

  const post2 = await postInternalTransfer(
    apiBase,
    senderToken,
    { to: recipientTo, amount: AMOUNT, description: DESCRIPTION },
    idempotencyKey
  );
  report.replayPost = { httpStatus: post2.res.status, replay: !!(post2.body.data && post2.body.data.replay) };
  report.checks.idempotencyReplay200 = post2.res.status === 200 && !!post2.body.success && !!post2.body.data.replay;

  if (hasDb) {
    const row = await prisma.internalTransfer.findFirst({ where: { id: transferId } });
    report.checks.internalTransferConcluida = row && String(row.status) === 'CONCLUIDA';
    report.checks.debitMovementIdFilled = !!(row && row.debitMovementId);
    report.checks.creditMovementIdFilled = !!(row && row.creditMovementId);

    const snapMid = await snapshotCounts(senderUser.id, recipientRow.id);
    report.after = {
      senderSaldoDb: money(snapMid.sender && snapMid.sender.saldoAtual),
      recipientSaldoDb: money(snapMid.recipient && snapMid.recipient.saldoAtual),
      internalTransferCountScope: snapMid.itCount,
      movimentacaoCountScope: snapMid.movCount,
      notificacaoCountScope: snapMid.notifCount,
    };

    report.checks.senderSaldoDeltaDb = assertDelta(
      report.before.senderSaldoDb,
      report.after.senderSaldoDb,
      -AMOUNT
    );
    report.checks.recipientSaldoDeltaDb = assertDelta(
      report.before.recipientSaldoDb,
      report.after.recipientSaldoDb,
      AMOUNT
    );

    report.checks.internalTransferCountPlusOne =
      snapBeforeCounts && snapMid.itCount === snapBeforeCounts.itCount + 1;
    report.checks.movimentacaoCountPlusTwo =
      snapBeforeCounts && snapMid.movCount === snapBeforeCounts.movCount + 2;
    report.checks.notificacaoCountPlusTwo =
      snapBeforeCounts && snapMid.notifCount === snapBeforeCounts.notifCount + 2;

    const debitMov = await prisma.movimentacao.findFirst({
      where: {
        userId: senderUser.id,
        tipo: 'transferencia_enviada',
        referenceType: 'internal_transfer',
        referenceId: transferId,
      },
    });
    const creditMov = await prisma.movimentacao.findFirst({
      where: {
        userId: recipientRow.id,
        tipo: 'transferencia_recebida',
        referenceType: 'internal_transfer',
        referenceId: transferId,
      },
    });
    report.checks.movimentacaoDebitoTipo = !!debitMov;
    report.checks.movimentacaoCreditoTipo = !!creditMov;

    const nSent = await prisma.notificacao.findUnique({
      where: { dedupeKey: `internal_transfer_sent:${transferId}` },
    });
    const nRec = await prisma.notificacao.findUnique({
      where: { dedupeKey: `internal_transfer_received:${transferId}` },
    });
    report.checks.notificacaoRemetente = !!nSent;
    report.checks.notificacaoDestinatario = !!nRec;

    const snapAfterReplay = await snapshotCounts(senderUser.id, recipientRow.id);
    report.checks.saldosEstaveisAposReplayIdempotente =
      money(snapAfterReplay.sender.saldoAtual) === report.after.senderSaldoDb &&
      money(snapAfterReplay.recipient.saldoAtual) === report.after.recipientSaldoDb;

    report.checks.countsEstaveisAposReplay =
      snapAfterReplay.itCount === snapMid.itCount &&
      snapAfterReplay.movCount === snapMid.movCount;
  }

  const stmtSend = await getStatement(apiBase, senderToken);
  const itemsSend = stmtSend.body && Array.isArray(stmtSend.body.items) ? stmtSend.body.items : [];
  report.checks.extratoRemetenteSaida = itemsSend.some(
    (m) => String(m.referenciaId || '') === String(transferId) && m.tipo === 'DEBITO'
  );

  let extratoDestEntrada = false;
  if (recipientToken) {
    const stmtRec = await getStatement(apiBase, recipientToken);
    const itemsRec = stmtRec.body && Array.isArray(stmtRec.body.items) ? stmtRec.body.items : [];
    extratoDestEntrada = itemsRec.some(
      (m) => String(m.referenciaId || '') === String(transferId) && m.tipo === 'CREDITO'
    );
  } else if (hasDb) {
    extratoDestEntrada = !!report.checks.movimentacaoCreditoTipo;
  } else {
    report.pendencias.push('Extrato do destinatário: informe AGILBANK_W2_RECIPIENT_TOKEN ou DATABASE_URL para validação.');
  }
  report.checks.extratoDestinatarioEntrada = extratoDestEntrada;

  const profSend1 = await getProfile(apiBase, senderToken);
  if (profSend1.res.ok && profSend1.body.success && profSend1.body.data && profSend1.body.data.user) {
    report.checks.senderSaldoDeltaApi = assertDelta(
      saldoSenderApiBefore,
      money(profSend1.body.data.user.saldoAtual),
      -AMOUNT
    );
  }

  if (!hasDb && recipientToken) {
    const profRec1 = await getProfile(apiBase, recipientToken);
    if (profRec1.res.ok && profRec1.body.success && profRec1.body.data && profRec1.body.data.user) {
      report.checks.recipientSaldoDeltaApi = assertDelta(
        profRecApiBefore,
        money(profRec1.body.data.user.saldoAtual),
        AMOUNT
      );
    }
  }

  if (hasDb) await prisma.$disconnect().catch(() => {});

  const c = report.checks;

  let hardFail =
    !c.idempotencyReplay200 || !c.extratoRemetenteSaida || !c.extratoDestinatarioEntrada;

  if (hasDb) {
    hardFail =
      hardFail ||
      !c.internalTransferConcluida ||
      !c.debitMovementIdFilled ||
      !c.creditMovementIdFilled ||
      !(c.senderSaldoDeltaDb && c.senderSaldoDeltaDb.ok) ||
      !(c.recipientSaldoDeltaDb && c.recipientSaldoDeltaDb.ok) ||
      !c.movimentacaoDebitoTipo ||
      !c.movimentacaoCreditoTipo ||
      !c.notificacaoRemetente ||
      !c.notificacaoDestinatario ||
      !c.internalTransferCountPlusOne ||
      !c.movimentacaoCountPlusTwo ||
      !c.notificacaoCountPlusTwo ||
      c.saldosEstaveisAposReplayIdempotente === false ||
      c.countsEstaveisAposReplay === false;
  } else {
    if (!c.senderSaldoDeltaApi || !c.senderSaldoDeltaApi.ok) {
      hardFail = true;
    }
    if (recipientToken && (!c.recipientSaldoDeltaApi || !c.recipientSaldoDeltaApi.ok)) {
      hardFail = true;
    }
  }

  report.statusFinal = hardFail ? 'REPROVADO' : 'APROVADO_OPERACIONALMENTE';

  console.log(JSON.stringify(report, null, 2));
  process.exit(hardFail ? 1 : 0);
}

main().catch((err) => {
  console.error(JSON.stringify({ fase: 'W.2', erro: err && err.message ? err.message : String(err) }, null, 2));
  process.exit(1);
});
