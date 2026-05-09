const { prisma } = require('../config/database');
const logger = require('../utils/logger');
const { sendLoanApprovedBlockedEmail } = require('../utils/email');
const { loanApprovedBlockedDedupeKey } = require('./inAppNotificationService');

const ACAO_SEGURO =
  'Quite o seguro do empréstimo no valor de R$ 39,90 para solicitar o desbloqueio do saldo.';
const ACAO_GARANTIA = 'Apresente uma garantia válida para solicitar o desbloqueio do saldo.';

/**
 * Envia e-mail de empréstimo aprovado (saldo bloqueado), idempotente por metadata.emailSentAt na mesma notificação in-app.
 * Não propaga erro: falha de e-mail não desfaz o empréstimo.
 */
async function sendLoanApprovedBlockedEmailIfNeeded({ loanId, userId, insuranceSelected, valorAprovado }) {
  if (!loanId || !userId) {
    logger.warn({ loanId, userId }, 'loan_blocked_email_skip_missing_ids');
    return;
  }

  const dedupeKey = loanApprovedBlockedDedupeKey(loanId);
  const notif = await prisma.notificacao.findUnique({
    where: { dedupeKey },
    select: { id: true, userId: true, metadata: true },
  });

  if (!notif || notif.userId !== userId) {
    logger.warn({ loanId, userId, dedupeKey }, 'loan_blocked_email_skip_no_notification');
    return;
  }

  const meta = notif.metadata && typeof notif.metadata === 'object' && !Array.isArray(notif.metadata)
    ? { ...notif.metadata }
    : {};
  if (meta.emailSentAt) {
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, nomeCompleto: true },
  });

  if (!user || !user.email || String(user.email).trim() === '') {
    logger.warn({ userId }, 'loan_blocked_email_skip_no_email');
    return;
  }

  const acaoDesbloqueio = insuranceSelected ? ACAO_SEGURO : ACAO_GARANTIA;

  try {
    await sendLoanApprovedBlockedEmail(
      { email: user.email, nomeCompleto: user.nomeCompleto },
      { valor: valorAprovado, acaoDesbloqueio }
    );
  } catch (err) {
    logger.error(
      { err: err.message, loanId, userId, code: err.code },
      'loan_blocked_email_send_failed'
    );
    return;
  }

  meta.emailSentAt = new Date().toISOString();
  try {
    await prisma.notificacao.update({
      where: { id: notif.id },
      data: { metadata: meta },
    });
  } catch (updErr) {
    logger.error({ err: updErr.message, notifId: notif.id }, 'loan_blocked_email_metadata_update_failed');
  }
}

/**
 * Agenda envio em background para não atrasar a resposta HTTP do empréstimo.
 */
function scheduleLoanApprovedBlockedEmail(payload) {
  setImmediate(() => {
    sendLoanApprovedBlockedEmailIfNeeded(payload).catch((err) => {
      logger.error({ err: err.message }, 'loan_blocked_email_deferred_failed');
    });
  });
}

module.exports = {
  sendLoanApprovedBlockedEmailIfNeeded,
  scheduleLoanApprovedBlockedEmail,
  ACAO_SEGURO,
  ACAO_GARANTIA,
};
