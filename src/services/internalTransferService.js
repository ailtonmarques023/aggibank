'use strict';

const crypto = require('crypto');
const { prisma } = require('../config/database');
const {
  LedgerError,
  registrarDebitoSaldoAtual,
  registrarCreditoSaldoAtual,
} = require('./ledgerService');
const { recordAudit } = require('../utils/auditLog');
const logger = require('../utils/logger');
const { getTransactionLimits } = require('../config/transactionLimits');
const { assertInternalTransferDailyLimits } = require('./operationalLimitsService');

const IDEMPOTENCY_MAX_LEN = 200;
const DESC_MAX_LEN = 500;

const recipientSelect = {
  id: true,
  email: true,
  nomeCompleto: true,
  numeroConta: true,
  digitoConta: true,
};

/**
 * @param {unknown} raw
 * @param {{ minAmount: number, maxAmount: number }} [perOpLimits]
 * @returns {{ ok: true, value: number } | { ok: false, code: string }}
 */
function normalizeTransferAmount(raw, perOpLimits) {
  const L = perOpLimits || getTransactionLimits().internalTransfer;
  if (raw == null || raw === '') {
    return { ok: false, code: 'INVALID_AMOUNT' };
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    return { ok: false, code: 'INVALID_AMOUNT' };
  }
  const cents = Math.round(n * 100);
  if (Math.abs(n * 100 - cents) > 1e-6) {
    return { ok: false, code: 'INVALID_AMOUNT' };
  }
  const value = cents / 100;
  if (value < L.minAmount || value > L.maxAmount) {
    return { ok: false, code: 'INVALID_AMOUNT' };
  }
  return { ok: true, value };
}

function normalizeIdempotencyKey(headerVal) {
  const s = String(headerVal || '').trim();
  if (!s) return `gen:${crypto.randomUUID()}`;
  return s.length > IDEMPOTENCY_MAX_LEN ? s.slice(0, IDEMPOTENCY_MAX_LEN) : s;
}

/**
 * @param {string} to
 * @returns {Promise<import('@prisma/client').User & object | null>}
 */
async function findUserByTo(to) {
  const raw = String(to || '').trim();
  if (!raw) return null;

  if (raw.includes('@')) {
    return prisma.user.findUnique({
      where: { email: raw.toLowerCase() },
      select: recipientSelect,
    });
  }

  const compact = raw.replace(/\s/g, '');
  const idx = compact.indexOf('-');
  if (idx > 0) {
    const n = compact.slice(0, idx);
    const d = compact.slice(idx + 1);
    if (n && d) {
      const u = await prisma.user.findFirst({
        where: { numeroConta: n, digitoConta: d },
        select: recipientSelect,
      });
      if (u) return u;
    }
  }

  return prisma.user.findFirst({
    where: { numeroConta: compact },
    select: recipientSelect,
  });
}

function formatCounterpartyLabel(u) {
  if (!u) return 'Conta AgilBank';
  const name = String(u.nomeCompleto || '').trim();
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    const first = parts[0] || '';
    const lastInitial = parts.length > 1 ? `${String(parts[parts.length - 1])[0]}.` : '';
    return `${first} ${lastInitial}`.trim();
  }
  if (u.numeroConta) {
    const tail = String(u.numeroConta).slice(-4);
    return `Conta ***${tail}`;
  }
  return 'Conta AgilBank';
}

function maskEmail(email) {
  const e = String(email || '');
  const at = e.indexOf('@');
  if (at <= 1) return '***';
  return `${e[0]}***@${e.slice(at + 1)}`;
}

/**
 * POST interno: executa transferência atômica via ledger.
 */
async function executeInternalTransfer(params) {
  const {
    fromUserId,
    fromUserNome,
    to,
    amountRaw,
    description,
    idempotencyHeader,
  } = params;

  const perOpLimits = getTransactionLimits({ userId: fromUserId }).internalTransfer;

  const amount = normalizeTransferAmount(amountRaw, perOpLimits);
  if (!amount.ok) {
    return {
      ok: false,
      code: amount.code,
      httpStatus: 400,
      message:
        amount.code === 'INVALID_AMOUNT'
          ? `Valor inválido. Informe entre R$ ${perOpLimits.minAmount.toFixed(2)} e R$ ${perOpLimits.maxAmount.toFixed(2)}, com até duas casas decimais.`
          : 'Valor inválido',
    };
  }

  const recipient = await findUserByTo(to);
  if (!recipient) {
    return {
      ok: false,
      code: 'RECIPIENT_NOT_FOUND',
      httpStatus: 404,
      message: 'Destinatário não encontrado.',
    };
  }
  if (recipient.id === fromUserId) {
    return {
      ok: false,
      code: 'SAME_ACCOUNT',
      httpStatus: 400,
      message: 'Não é possível transferir para a própria conta.',
    };
  }

  const idempotencyKey = normalizeIdempotencyKey(idempotencyHeader);

  const existingDone = await prisma.internalTransfer.findFirst({
    where: {
      fromUserId,
      idempotencyKey,
      status: 'CONCLUIDA',
    },
    include: {
      toUser: { select: { id: true, nomeCompleto: true, email: true, numeroConta: true, digitoConta: true } },
    },
  });

  if (existingDone) {
    return { ok: true, replay: true, transfer: existingDone };
  }

  const dailyCheck = await assertInternalTransferDailyLimits(prisma, fromUserId, amount.value);
  if (!dailyCheck.ok) {
    return {
      ok: false,
      code: dailyCheck.code,
      httpStatus: dailyCheck.httpStatus,
      message: dailyCheck.message,
    };
  }

  try {
    const pack = await prisma.$transaction(async (tx) => {
      const transferRow = await tx.internalTransfer.create({
        data: {
          fromUserId,
          toUserId: recipient.id,
          amount: amount.value,
          status: 'PENDENTE',
          idempotencyKey,
          description:
            description != null && String(description).trim()
              ? String(description).trim().slice(0, DESC_MAX_LEN)
              : null,
        },
      });

      const senderLabel = formatCounterpartyLabel({ nomeCompleto: fromUserNome });
      const recipientLabel = formatCounterpartyLabel(recipient);

      const debitMov = await registrarDebitoSaldoAtual(tx, {
        userId: fromUserId,
        valorDebito: amount.value,
        tipo: 'transferencia_enviada',
        descricao: `Transferência AgilBank enviada para ${recipientLabel}`,
        categoria: 'transferencia_interna',
        referenceType: 'internal_transfer',
        referenceId: transferRow.id,
        idempotencyKey: `internal_transfer_debit:${transferRow.id}`,
      });

      const creditMov = await registrarCreditoSaldoAtual(tx, {
        userId: recipient.id,
        valorCredito: amount.value,
        tipo: 'transferencia_recebida',
        descricao: `Transferência AgilBank recebida de ${senderLabel}`,
        categoria: 'transferencia_interna',
        referenceType: 'internal_transfer',
        referenceId: transferRow.id,
        idempotencyKey: `internal_transfer_credit:${transferRow.id}`,
      });

      const updated = await tx.internalTransfer.update({
        where: { id: transferRow.id },
        data: {
          status: 'CONCLUIDA',
          debitMovementId: debitMov.id,
          creditMovementId: creditMov.id,
          completedAt: new Date(),
        },
        include: {
          toUser: {
            select: { id: true, nomeCompleto: true, email: true, numeroConta: true, digitoConta: true },
          },
        },
      });

      return { transfer: updated };
    });

    try {
      await recordAudit({
        userId: fromUserId,
        action: 'internal_transfer.concluida',
        entity: 'InternalTransfer',
        entityId: pack.transfer.id,
        metadata: {
          toUserId: recipient.id,
          amount: amount.value,
          idempotencyKey,
        },
        ip: null,
        userAgent: null,
      });
    } catch (auditErr) {
      logger.warn('internal_transfer_audit_failed', { message: auditErr.message });
    }

    return { ok: true, transfer: pack.transfer, recipient };
  } catch (e) {
    if (e && e.code === 'P2002') {
      const clash = await prisma.internalTransfer.findFirst({
        where: { fromUserId, idempotencyKey },
        include: {
          toUser: {
            select: { id: true, nomeCompleto: true, email: true, numeroConta: true, digitoConta: true },
          },
        },
      });
      if (clash && clash.status === 'CONCLUIDA') {
        return { ok: true, replay: true, transfer: clash };
      }
      return {
        ok: false,
        code: 'DUPLICATE_TRANSFER',
        httpStatus: 409,
        message: 'Esta operação já está em processamento ou foi registrada com a mesma chave de idempotência.',
      };
    }
    if (e instanceof LedgerError) {
      let http = e.httpStatus;
      let code = e.code;
      if (e.code === 'INSUFFICIENT_BALANCE') {
        http = 400;
      }
      return { ok: false, code, httpStatus: http, message: e.message };
    }
    throw e;
  }
}

function serializeTransferPublic(transfer, viewerUserId) {
  if (!transfer) return null;
  const amount = transfer.amount != null ? Number(transfer.amount) : null;
  const base = {
    id: transfer.id,
    status: transfer.status,
    amount: Number.isFinite(amount) ? amount : null,
    description: transfer.description || null,
    createdAt: transfer.createdAt ? transfer.createdAt.toISOString() : null,
    completedAt: transfer.completedAt ? transfer.completedAt.toISOString() : null,
    idempotencyKey:
      transfer.idempotencyKey && String(transfer.idempotencyKey).startsWith('gen:') ? null : transfer.idempotencyKey,
  };

  if (transfer.fromUserId === viewerUserId) {
    base.direction = 'sent';
    if (transfer.toUser) {
      base.counterparty = {
        label: formatCounterpartyLabel(transfer.toUser),
        emailMasked: maskEmail(transfer.toUser.email),
        conta:
          transfer.toUser.numeroConta && transfer.toUser.digitoConta
            ? `${transfer.toUser.numeroConta}-${transfer.toUser.digitoConta}`
            : transfer.toUser.numeroConta || null,
      };
    }
  } else if (transfer.toUserId === viewerUserId) {
    base.direction = 'received';
    if (transfer.fromUser && transfer.fromUserId) {
      base.counterparty = {
        label: formatCounterpartyLabel(transfer.fromUser),
        emailMasked: transfer.fromUser.email ? maskEmail(transfer.fromUser.email) : null,
        conta:
          transfer.fromUser.numeroConta && transfer.fromUser.digitoConta
            ? `${transfer.fromUser.numeroConta}-${transfer.fromUser.digitoConta}`
            : transfer.fromUser.numeroConta || null,
      };
    }
  }

  return base;
}

module.exports = {
  get MIN_AMOUNT() {
    return getTransactionLimits().internalTransfer.minAmount;
  },
  get MAX_AMOUNT() {
    return getTransactionLimits().internalTransfer.maxAmount;
  },
  normalizeTransferAmount,
  normalizeIdempotencyKey,
  findUserByTo,
  formatCounterpartyLabel,
  maskEmail,
  executeInternalTransfer,
  serializeTransferPublic,
};
