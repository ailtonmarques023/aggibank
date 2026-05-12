#!/usr/bin/env node
'use strict';

/**
 * Validação final W.2 — somente leitura, sem POST.
 *
 * Modo 1 (recomendado): DATABASE_URL + AGILBANK_W2_VALIDATE_TRANSFER_ID (id do comprovante).
 *    Se AGILBANK_W2_EXPECTED_AMOUNT estiver definido, o amount da linha deve coincidir.
 * Modo 2: DATABASE_URL sem id → última InternalTransfer CONCLUIDA com amount =
 *    AGILBANK_W2_EXPECTED_AMOUNT (ex.: 50.00), ou R$ 1,00 se a variável estiver ausente.
 *
 * Opcional (API, sem segredos no stdout):
 *   AGILBANK_W2_SENDER_TOKEN + AGILBANK_W2_API_BASE → confere GET /transfers/:id e /user/statement (saída).
 *   AGILBANK_W2_RECIPIENT_TOKEN → confere extrato entrada.
 *
 * Saída: JSON resumido; exit 0 = aprovado; 1 = reprovado; 2 = pendência (sem DB nem id).
 */

require('dotenv').config();

const { Prisma } = require('@prisma/client');
const { prisma } = require('../src/config/database');
const { maskEmail } = require('../src/services/internalTransferService');
const { getTransactionLimits } = require('../src/config/transactionLimits');

const MAX_VALIDATE_AMOUNT = getTransactionLimits().internalTransfer.maxAmount;

function parseExpectedAmountFromEnv() {
  const raw = process.env.AGILBANK_W2_EXPECTED_AMOUNT;
  const explicit = raw != null && String(raw).trim() !== '';
  const str = explicit ? String(raw).trim() : '1.00';
  let dec;
  try {
    dec = new Prisma.Decimal(str);
  } catch (_) {
    throw new Error('AGILBANK_W2_EXPECTED_AMOUNT inválido (Decimal).');
  }
  const n = Number(dec);
  if (!Number.isFinite(n) || n <= 0 || n > MAX_VALIDATE_AMOUNT) {
    throw new Error(
      `AGILBANK_W2_EXPECTED_AMOUNT deve ser positivo e até R$ ${MAX_VALIDATE_AMOUNT.toFixed(2)}.`
    );
  }
  const cents = Math.round(n * 100);
  if (Math.abs(n * 100 - cents) > 1e-6) {
    throw new Error('AGILBANK_W2_EXPECTED_AMOUNT: no máximo duas casas decimais.');
  }
  return { explicit, str, dec, num: cents / 100 };
}

/** @param {number} a @param {number} b */
function nearlyMoneyEqual(a, b) {
  return Math.round((Number(a) - Number(b)) * 100) / 100 === 0;
}

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
  if (n == null) return null;
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
    body = {};
  }
  return { res, body };
}

async function prismaPing() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (_) {
    return false;
  }
}

function maskParty(u) {
  if (!u) return null;
  return {
    id: u.id,
    emailMasked: u.email ? maskEmail(u.email) : null,
    conta:
      u.numeroConta && u.digitoConta
        ? `***${String(u.numeroConta).slice(-2)}-${u.digitoConta}`
        : u.numeroConta
          ? `***${String(u.numeroConta).slice(-2)}`
          : null,
  };
}

async function main() {
  const report = {
    mode: 'W.2-readonly-validation',
    timestamp: new Date().toISOString(),
    checks: {},
    warnings: [],
    errors: [],
  };

  let expectedSpec;
  try {
    expectedSpec = parseExpectedAmountFromEnv();
  } catch (e) {
    report.errors.push(e && e.message ? e.message : String(e));
    console.log(JSON.stringify(report, null, 2));
    process.exit(2);
  }

  const explicitId = String(process.env.AGILBANK_W2_VALIDATE_TRANSFER_ID || '').trim();
  const hasDb = await prismaPing();
  const senderTok = process.env.AGILBANK_W2_SENDER_TOKEN;
  const recipientTok = process.env.AGILBANK_W2_RECIPIENT_TOKEN;
  const apiBase = normalizeApiBase(process.env.AGILBANK_W2_API_BASE);

  report.config = {
    validateTransferId: explicitId || null,
    expectedAmountEnvSet: expectedSpec.explicit,
    expectedAmountBrl: expectedSpec.str,
    lookupLatestConcluidaByAmount: !explicitId,
  };

  if (!hasDb) {
    report.warnings.push('DATABASE_URL não conectou: validação completa de ledger/notificações fica indisponível.');
  }

  let transfer = null;

  if (hasDb) {
    if (explicitId) {
      transfer = await prisma.internalTransfer.findFirst({
        where: { id: explicitId },
        include: {
          fromUser: {
            select: {
              id: true,
              email: true,
              nomeCompleto: true,
              numeroConta: true,
              digitoConta: true,
              saldoAtual: true,
            },
          },
          toUser: {
            select: {
              id: true,
              email: true,
              nomeCompleto: true,
              numeroConta: true,
              digitoConta: true,
              saldoAtual: true,
            },
          },
        },
      });
      if (!transfer) {
        report.errors.push('Transferência não encontrada para AGILBANK_W2_VALIDATE_TRANSFER_ID.');
      }
    } else {
      transfer = await prisma.internalTransfer.findFirst({
        where: {
          status: 'CONCLUIDA',
          amount: { equals: expectedSpec.dec },
        },
        orderBy: { completedAt: 'desc' },
        include: {
          fromUser: {
            select: {
              id: true,
              email: true,
              nomeCompleto: true,
              numeroConta: true,
              digitoConta: true,
              saldoAtual: true,
            },
          },
          toUser: {
            select: {
              id: true,
              email: true,
              nomeCompleto: true,
              numeroConta: true,
              digitoConta: true,
              saldoAtual: true,
            },
          },
        },
      });
      report.warnings.push(
        `AGILBANK_W2_VALIDATE_TRANSFER_ID ausente — usando última InternalTransfer CONCLUIDA de R$ ${expectedSpec.str} por completedAt.`
      );
    }
  }

  if (!transfer) {
    if (hasDb) {
      report.errors.push(
        explicitId
          ? 'Transferência não encontrada para AGILBANK_W2_VALIDATE_TRANSFER_ID.'
          : `Nenhuma InternalTransfer CONCLUIDA de R$ ${expectedSpec.str} encontrada; informe AGILBANK_W2_VALIDATE_TRANSFER_ID ou ajuste AGILBANK_W2_EXPECTED_AMOUNT.`
      );
    } else if (senderTok) {
      report.errors.push('Sem DATABASE_URL não é possível validar debitMovementId/creditMovementId no banco.');
    } else {
      report.errors.push('Configure DATABASE_URL (validação ledger) para prosseguir.');
    }
    report.checks.ready = false;
    console.log(JSON.stringify(report, null, 2));
    await prisma.$disconnect().catch(() => {});
    process.exit(explicitId && hasDb ? 1 : 2);
  }

  report.transferId = transfer.id;
  report.parties = {
    from: maskParty(transfer.fromUser),
    to: maskParty(transfer.toUser),
  };

  /** valor esperado para movimentações: env+id exige match; só id usa amount da linha; lookup usa env/fallback */
  let expectedNum;
  if (explicitId) {
    if (expectedSpec.explicit) {
      expectedNum = expectedSpec.num;
    } else {
      expectedNum = money(transfer.amount);
    }
  } else {
    expectedNum = expectedSpec.num;
  }

  const c = report.checks;

  c.statusConcluida = transfer.status === 'CONCLUIDA';
  c.fromUserId = !!transfer.fromUserId;
  c.toUserId = !!transfer.toUserId;
  c.debitMovementId = !!transfer.debitMovementId;
  c.creditMovementId = !!transfer.creditMovementId;
  c.completedAt = !!transfer.completedAt;
  c.idempotencyKeyPresent = !!(transfer.idempotencyKey && String(transfer.idempotencyKey).trim());
  if (expectedSpec.explicit) {
    c.amountMatchesExpected = nearlyMoneyEqual(money(transfer.amount), expectedSpec.num);
  } else if (explicitId) {
    c.amountMatchesExpected = true;
  } else {
    c.amountMatchesExpected = nearlyMoneyEqual(money(transfer.amount), expectedSpec.num);
  }

  const duplicateConcluidas = await prisma.internalTransfer.count({
    where: {
      fromUserId: transfer.fromUserId,
      idempotencyKey: transfer.idempotencyKey,
      status: 'CONCLUIDA',
    },
  });
  c.singleConcluidaPerIdempotencyKey = duplicateConcluidas === 1;

  const debitMov = transfer.debitMovementId
    ? await prisma.movimentacao.findFirst({ where: { id: transfer.debitMovementId } })
    : null;
  const creditMov = transfer.creditMovementId
    ? await prisma.movimentacao.findFirst({ where: { id: transfer.creditMovementId } })
    : null;

  c.movRemetenteTipo = debitMov && debitMov.tipo === 'transferencia_enviada';
  c.movRemetenteValorDebito = debitMov && nearlyMoneyEqual(money(debitMov.valor), -expectedNum);
  c.movRemetenteRef =
    debitMov &&
    debitMov.referenceType === 'internal_transfer' &&
    String(debitMov.referenceId) === String(transfer.id);

  c.movDestinatarioTipo = creditMov && creditMov.tipo === 'transferencia_recebida';
  c.movDestinatarioValorCredito = creditMov && nearlyMoneyEqual(money(creditMov.valor), expectedNum);
  c.movDestinatarioRef =
    creditMov &&
    creditMov.referenceType === 'internal_transfer' &&
    String(creditMov.referenceId) === String(transfer.id);

  const dupDebit = transfer.debitMovementId
    ? await prisma.movimentacao.count({
        where: {
          userId: transfer.fromUserId,
          tipo: 'transferencia_enviada',
          referenceType: 'internal_transfer',
          referenceId: transfer.id,
        },
      })
    : 0;
  const dupCredit = transfer.creditMovementId
    ? await prisma.movimentacao.count({
        where: {
          userId: transfer.toUserId,
          tipo: 'transferencia_recebida',
          referenceType: 'internal_transfer',
          referenceId: transfer.id,
        },
      })
    : 0;
  c.semDuplicidadeMovRemetente = dupDebit === 1;
  c.semDuplicidadeMovDestinatario = dupCredit === 1;

  if (debitMov && transfer.fromUser) {
    const expectedAfterDebit = money(debitMov.saldoAtual);
    const currentSender = money(transfer.fromUser.saldoAtual);
    if (currentSender !== expectedAfterDebit) {
      report.warnings.push(
        'Saldo atual do remetente difere do saldoAtual registrado na movimentação de débito (possíveis operações posteriores).'
      );
    }
  }
  if (creditMov && transfer.toUser) {
    const expectedAfterCredit = money(creditMov.saldoAtual);
    const currentRec = money(transfer.toUser.saldoAtual);
    if (currentRec !== expectedAfterCredit) {
      report.warnings.push(
        'Saldo atual do destinatário difere do saldoAtual da movimentação de crédito (possíveis operações posteriores).'
      );
    }
  }

  const evidenceDebit = debitMov
    ? Math.round((money(debitMov.saldoAtual) - money(debitMov.saldoAnterior)) * 100) / 100
    : null;
  const evidenceCredit = creditMov
    ? Math.round((money(creditMov.saldoAtual) - money(creditMov.saldoAnterior)) * 100) / 100
    : null;
  report.evidenciaSaldosPelaMov = {
    remetenteDeltaRegistrado: evidenceDebit,
    destinatarioDeltaRegistrado: evidenceCredit,
    expectedBrl: expectedNum,
  };
  c.deltaRemetenteCorreto =
    evidenceDebit != null && Number.isFinite(evidenceDebit) && nearlyMoneyEqual(evidenceDebit, -expectedNum);
  c.deltaDestinatarioCorreto =
    evidenceCredit != null && Number.isFinite(evidenceCredit) && nearlyMoneyEqual(evidenceCredit, expectedNum);

  const nSent = await prisma.notificacao.findUnique({
    where: { dedupeKey: `internal_transfer_sent:${transfer.id}` },
  });
  const nRec = await prisma.notificacao.findUnique({
    where: { dedupeKey: `internal_transfer_received:${transfer.id}` },
  });
  c.notifRemetente = !!nSent && nSent.userId === transfer.fromUserId;
  c.notifDestinatario = !!nRec && nRec.userId === transfer.toUserId;

  const dupNotifSent = await prisma.notificacao.count({
    where: { dedupeKey: `internal_transfer_sent:${transfer.id}` },
  });
  const dupNotifRec = await prisma.notificacao.count({
    where: { dedupeKey: `internal_transfer_received:${transfer.id}` },
  });
  c.semDuplicidadeNotif = dupNotifSent <= 1 && dupNotifRec <= 1;

  if (senderTok) {
    const st = await apiJson(`${apiBase}/user/statement?limit=80`, {
      headers: { Authorization: bearer(senderTok) },
    });
    const items = st.body && Array.isArray(st.body.items) ? st.body.items : [];
    const idx = items.findIndex(
      (m) => String(m.referenciaId || '') === String(transfer.id) && m.tipo === 'DEBITO'
    );
    c.extratoApiRemetenteSaida = st.res.ok && idx !== -1;
    if (!c.extratoApiRemetenteSaida) {
      report.warnings.push('GET /user/statement (remetente) não encontrou DEBITO com referenciaId da transferência (token pode não ser do remetente ou item fora do limite).');
    }
  } else {
    report.warnings.push('AGILBANK_W2_SENDER_TOKEN ausente — extrato remetente via API não validado.');
    c.extratoApiRemetenteSaida = null;
  }

  if (recipientTok) {
    const st = await apiJson(`${apiBase}/user/statement?limit=80`, {
      headers: { Authorization: bearer(recipientTok) },
    });
    const items = st.body && Array.isArray(st.body.items) ? st.body.items : [];
    const idx = items.findIndex(
      (m) => String(m.referenciaId || '') === String(transfer.id) && m.tipo === 'CREDITO'
    );
    c.extratoApiDestinatarioEntrada = st.res.ok && idx !== -1;
    if (!c.extratoApiDestinatarioEntrada) {
      report.warnings.push('Extrato destinatário via API não encontrou CREDITO esperado.');
    }
  } else {
    c.extratoApiDestinatarioEntrada = null;
    report.warnings.push('Extrato destinatário: validado pelo banco (movimentação crédito); token do destinatário opcional.');
  }

  const extratoDestinatarioViaDb =
    !!(c.movDestinatarioTipo && c.movDestinatarioValorCredito && c.movDestinatarioRef);
  c.extratoDestinatarioViaDb = extratoDestinatarioViaDb;

  const coreLedgerOk =
    c.statusConcluida &&
    c.fromUserId &&
    c.toUserId &&
    c.debitMovementId &&
    c.creditMovementId &&
    c.completedAt &&
    c.idempotencyKeyPresent &&
    c.amountMatchesExpected &&
    c.singleConcluidaPerIdempotencyKey &&
    c.movRemetenteTipo &&
    c.movRemetenteValorDebito &&
    c.movRemetenteRef &&
    c.movDestinatarioTipo &&
    c.movDestinatarioValorCredito &&
    c.movDestinatarioRef &&
    c.semDuplicidadeMovRemetente &&
    c.semDuplicidadeMovDestinatario &&
    c.deltaRemetenteCorreto &&
    c.deltaDestinatarioCorreto &&
    c.notifRemetente &&
    c.notifDestinatario &&
    c.semDuplicidadeNotif;

  let finalOk = coreLedgerOk;
  if (senderTok && c.extratoApiRemetenteSaida !== true) finalOk = false;
  if (recipientTok && c.extratoApiDestinatarioEntrada !== true) finalOk = false;

  report.statusFinal = finalOk ? 'APROVADO_OPERACIONALMENTE' : 'REPROVADO';

  console.log(JSON.stringify(report, null, 2));
  await prisma.$disconnect().catch(() => {});
  process.exit(finalOk ? 0 : 1);
}

main().catch((err) => {
  console.error(JSON.stringify({ erro: err && err.message ? err.message : String(err) }, null, 2));
  prisma.$disconnect().catch(() => {});
  process.exit(1);
});
