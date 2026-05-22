'use strict';

/**
 * Mensagens públicas KYC (Fatia 3) — sem PII, sem detalhe antifraude ou crédito.
 */

const KYC_PUBLIC_MESSAGES = Object.freeze({
  NOT_STARTED: 'Você ainda não iniciou o envio de documentos.',
  DRAFT: 'Continue o envio dos documentos obrigatórios e confirme cada arquivo após upload.',
  PENDING_UPLOADS: 'Continue o envio dos documentos obrigatórios e confirme cada arquivo após upload.',
  PENDING_UPLOADS_READY:
    'Todos os documentos foram confirmados. Você já pode enviar para análise.',
  READY_FOR_REVIEW: 'Seus documentos foram recebidos e estão na fila de análise.',
  UNDER_MANUAL_REVIEW:
    'Estamos analisando sua identidade. Avisaremos quando houver atualização.',
  APPROVED: 'Sua identidade foi aprovada. Você já pode continuar.',
  RESUBMISSION_REQUIRED:
    'Precisamos que você envie novamente alguns dados para concluir sua verificação.',
  REJECTED: 'Não foi possível validar sua identidade com os dados enviados.',
});

/**
 * @param {string} identityStatus
 * @param {{ allArtifactsConfirmed?: boolean }} [opts]
 * @returns {string}
 */
function getPublicMessageForIdentityStatus(identityStatus, opts = {}) {
  const st = String(identityStatus || '').trim();
  if ((st === 'DRAFT' || st === 'PENDING_UPLOADS') && opts.allArtifactsConfirmed) {
    return KYC_PUBLIC_MESSAGES.PENDING_UPLOADS_READY;
  }
  if (st === 'DRAFT' || st === 'PENDING_UPLOADS') {
    return KYC_PUBLIC_MESSAGES.DRAFT;
  }
  if (Object.prototype.hasOwnProperty.call(KYC_PUBLIC_MESSAGES, st)) {
    return KYC_PUBLIC_MESSAGES[st];
  }
  return KYC_PUBLIC_MESSAGES.NOT_STARTED;
}

module.exports = {
  KYC_PUBLIC_MESSAGES,
  getPublicMessageForIdentityStatus,
};
