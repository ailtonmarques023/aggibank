const { prisma } = require('../config/database');
const logger = require('../utils/logger');
const { sendCardApprovedEmail } = require('../utils/email');
const { cardApprovedDedupeKey } = require('./inAppNotificationService');

/**
 * E-mail de cartão aprovado, idempotente via metadata.emailSentAt na notificação in-app (mesmo dedupeKey).
 * Falhas de envio não propagam (não desfazem aprovação).
 */
async function sendCardApprovedEmailIfNeeded({ cardId, userId, limiteAprovado, status }) {
  if (!cardId || !userId) {
    logger.warn({ cardId, userId }, 'card_approved_email_skip_missing_ids');
    return;
  }

  const dedupeKey = cardApprovedDedupeKey(cardId);
  const notif = await prisma.notificacao.findUnique({
    where: { dedupeKey },
    select: { id: true, userId: true, metadata: true },
  });

  if (!notif || notif.userId !== userId) {
    logger.warn({ cardId, userId, dedupeKey }, 'card_approved_email_skip_no_notification');
    return;
  }

  const meta =
    notif.metadata && typeof notif.metadata === 'object' && !Array.isArray(notif.metadata)
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
    logger.warn({ userId }, 'card_approved_email_skip_no_email');
    return;
  }

  const limiteNum = Number(limiteAprovado);
  if (!Number.isFinite(limiteNum) || limiteNum <= 0) {
    logger.warn({ cardId, limiteAprovado }, 'card_approved_email_skip_invalid_limit');
    return;
  }

  try {
    await sendCardApprovedEmail(
      { email: user.email, nomeCompleto: user.nomeCompleto },
      { limite: limiteNum, status: status || 'aprovado' },
    );
  } catch (err) {
    logger.error(
      { err: err.message, cardId, userId, code: err.code },
      'card_approved_email_send_failed',
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
    logger.error({ err: updErr.message, notifId: notif.id }, 'card_approved_email_metadata_update_failed');
  }
}

function scheduleCardApprovedEmail(payload) {
  void sendCardApprovedEmailIfNeeded(payload).catch((err) => {
    logger.error({ err: err.message }, 'card_approved_email_deferred_failed');
  });
}

module.exports = {
  sendCardApprovedEmailIfNeeded,
  scheduleCardApprovedEmail,
};
