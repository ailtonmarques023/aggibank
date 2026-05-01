const { prisma } = require('../config/database');
const logger = require('./logger');

/**
 * Persiste evento de auditoria. Falhas não interrompem o fluxo principal.
 */
async function recordAudit({ userId, action, entity, entityId, metadata, ip, userAgent }) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: userId ?? null,
        action,
        entity,
        entityId: entityId ?? null,
        metadata: metadata ?? undefined,
        ip: ip ?? null,
        userAgent: userAgent ?? null,
      },
    });
  } catch (err) {
    logger.error('audit_log_write_failed', {
      action,
      entity,
      message: err.message,
    });
  }
}

module.exports = { recordAudit };
