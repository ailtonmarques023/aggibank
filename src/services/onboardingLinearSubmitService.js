'use strict';

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { prisma } = require('../config/database');
const identityStorage = require('./identityStorageService');
const identityService = require('./identityService');
const kycAutoDecision = require('./kycAutoDecisionService');
const onboardingFinalize = require('./onboardingFinalizeService');
const {
  generateProtocolNumber,
  generateOnboardingToken,
  hashOnboardingToken,
  normalizeCpfDigits,
  normalizeEmail,
  hasPersonalDataComplete,
  hasAddressComplete,
  hasProfessionalComplete,
  noteActiveApplicationDuplicate,
  httpError,
} = require('./accountApplicationService');
const { isValidCpf } = require('../utils/cpfValidation');
const { KYC_PUBLIC_MESSAGES } = require('../constants/kycPublicMessages');
const { sendEmail } = require('../utils/email');
const logger = require('../utils/logger');

const WAIT_REVIEW_PUBLIC_MESSAGE =
  'Recebemos sua proposta de abertura. Enviamos um e-mail de confirmação e você receberá uma atualização quando a análise for concluída.';

function isEmailProviderNotConfiguredError(err) {
  return err && (err.code === 'EMAIL_PROVIDER_NOT_CONFIGURED' || err.name === 'EmailProviderNotConfiguredError');
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function primeiroNome(nomeCompleto) {
  const s = String(nomeCompleto ?? '').trim();
  if (!s) return 'Cliente';
  return s.split(/\s+/)[0] || 'Cliente';
}

/**
 * Confirmação transacional — falha de e-mail não impede o recebimento da proposta.
 * @param {{ email?: string | null, nomeCompleto?: string | null, protocolNumber?: string | null }} applicationRow
 */
async function sendProposalReceivedEmailBestEffort(applicationRow) {
  const to = normalizeEmail(applicationRow?.email);
  if (!to) return { status: 'skipped_no_email' };

  const nome = primeiroNome(applicationRow.nomeCompleto);
  const protocol = String(applicationRow.protocolNumber || '').trim() || '—';
  const subject = 'AgilBank — Proposta de abertura recebida';
  const text = [
    `Olá, ${nome}!`,
    '',
    'Recebemos sua proposta de abertura de conta no AgilBank.',
    '',
    `Protocolo: ${protocol}`,
    '',
    'Estamos analisando seus documentos. Você receberá um novo e-mail quando houver atualização sobre a proposta.',
    '',
    'Confira também a pasta de spam ou promoções.',
    '',
    'Equipe AgilBank',
  ].join('\n');

  const html = `
    <p style="margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#1e293b;">
      Olá, <strong>${escapeHtml(nome)}</strong>!
    </p>
    <p style="margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#1e293b;">
      Recebemos sua proposta de abertura de conta no AgilBank.
    </p>
    <p style="margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#64748b;">
      Protocolo
    </p>
    <p style="margin:0 0 16px;font-family:Consolas,monospace;font-size:16px;font-weight:700;color:#003355;">
      ${escapeHtml(protocol)}
    </p>
    <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#475569;">
      Estamos analisando seus documentos. Você receberá um novo e-mail quando houver atualização.
      Confira também spam e promoções.
    </p>`;

  try {
    await sendEmail({ to, subject, html, text });
    logger.info(
      {
        category: 'operational_audit',
        component: 'onboarding_linear_submit',
        op: 'proposal_received_email_sent',
        toDomain: to.split('@')[1] || 'unknown',
      },
      'onboarding_linear_proposal_email_sent'
    );
    return { status: 'sent' };
  } catch (err) {
    if (isEmailProviderNotConfiguredError(err)) {
      logger.warn(
        {
          category: 'operational_audit',
          component: 'onboarding_linear_submit',
          op: 'proposal_received_email_not_configured',
        },
        'onboarding_linear_proposal_email_skipped_provider'
      );
      return { status: 'not_configured' };
    }
    logger.warn(err, {
      context: 'onboarding-linear-proposal-received-email',
      toDomain: to.split('@')[1] || 'unknown',
    });
    return { status: 'failed' };
  }
}

async function returnWaitReview(applicationRow, message = WAIT_REVIEW_PUBLIC_MESSAGE) {
  await sendProposalReceivedEmailBestEffort(applicationRow);
  return buildWaitReviewResponse(applicationRow, message);
}

function resolveAutoDecisionFlags() {
  const autoEnabled = kycAutoDecision.isAutoDecisionEnabled();
  const autoShadow = kycAutoDecision.isAutoDecisionShadow();
  return {
    autoEnabled,
    autoShadow,
    shouldApply: autoEnabled && !autoShadow,
  };
}

function buildWaitReviewResponse(applicationRow, message = WAIT_REVIEW_PUBLIC_MESSAGE) {
  return buildPublicResponse({
    protocolNumber: applicationRow.protocolNumber,
    applicationStatus: applicationRow.status,
    message,
    nextStep: 'WAIT_REVIEW',
  });
}

async function runProposalAutoDecision(submissionId) {
  const { autoEnabled, autoShadow, shouldApply } = resolveAutoDecisionFlags();

  if (!autoEnabled) {
    return { autoResult: null, autoDecisionFailed: false };
  }

  try {
    const autoResult = await kycAutoDecision.evaluateOnboardingProposalSubmission(submissionId, {
      enabled: autoEnabled,
      shadow: autoShadow,
      apply: shouldApply,
      trigger: 'onboarding_linear_submit',
    });
    return { autoResult, autoDecisionFailed: false, autoDecisionCanFinalize: shouldApply };
  } catch (err) {
    logger.error(
      {
        category: 'operational_error',
        component: 'onboarding_linear_submit',
        op: 'autodecision_failed',
        submissionIdLen: String(submissionId || '').length,
        message: err && err.message ? String(err.message).slice(0, 200) : 'unknown',
      },
      'onboarding_linear_autodecision_error'
    );
    return { autoResult: null, autoDecisionFailed: true, autoDecisionCanFinalize: false };
  }
}

function isOnboardingLinearSubmitEnabled() {
  return String(process.env.ONBOARDING_LINEAR_SUBMIT_ENABLED || '').toLowerCase().trim() === 'true';
}

function assertLinearSubmitEnabled() {
  if (!isOnboardingLinearSubmitEnabled()) {
    throw httpError(
      503,
      'ONBOARDING_LINEAR_SUBMIT_DISABLED',
      'Envio completo de proposta está indisponível no momento.'
    );
  }
}

function assertKycStorageEnabled() {
  if (!identityStorage.isIdentityStorageFeatureFlagOn()) {
    throw new identityStorage.IdentityStorageDisabledError(
      'FEATURE_KYC_DISABLED',
      'Envio de documentos está indisponível no momento.'
    );
  }
}

function parseBooleanField(raw, fieldName) {
  if (raw === true || raw === 'true' || raw === '1' || raw === 1) return true;
  if (raw === false || raw === 'false' || raw === '0' || raw === 0) return false;
  throw httpError(400, 'VALIDATION_ERROR', `${fieldName} inválido`);
}

function parseFields(body) {
  const cpf = normalizeCpfDigits(body.cpf);
  if (!cpf || !isValidCpf(cpf)) {
    throw httpError(400, 'VALIDATION_ERROR', 'CPF inválido.');
  }

  const email = normalizeEmail(body.email);
  if (!email) {
    throw httpError(400, 'VALIDATION_ERROR', 'E-mail inválido.');
  }

  const nome = body.nome != null ? String(body.nome).trim() : String(body.nomeCompleto || '').trim();
  if (!nome) {
    throw httpError(400, 'VALIDATION_ERROR', 'Nome completo é obrigatório.');
  }

  const telefone = body.telefone != null ? String(body.telefone).replace(/\D/g, '') : '';
  if (!telefone) {
    throw httpError(400, 'VALIDATION_ERROR', 'Telefone é obrigatório.');
  }

  let dataNascimento = null;
  if (body.dataNascimento) {
    const d = new Date(body.dataNascimento);
    if (Number.isNaN(d.getTime())) {
      throw httpError(400, 'VALIDATION_ERROR', 'Data de nascimento inválida.');
    }
    dataNascimento = d;
  } else {
    throw httpError(400, 'VALIDATION_ERROR', 'Data de nascimento é obrigatória.');
  }

  const senhaPlain = body.senha != null ? String(body.senha) : '';
  if (!/^\d{6}$/.test(senhaPlain)) {
    throw httpError(400, 'VALIDATION_ERROR', 'Senha deve ter 6 dígitos numéricos.');
  }

  const endereco = {
    cep: String(body.cep || '').replace(/\D/g, ''),
    logradouro: String(body.rua || body.logradouro || '').trim(),
    numero: String(body.numero || '').trim(),
    complemento: String(body.complemento || '').trim(),
    bairro: String(body.bairro || '').trim(),
    cidade: String(body.cidade || '').trim(),
    estado: String(body.estado || '').trim().toUpperCase(),
  };

  if (!hasAddressComplete(endereco)) {
    throw httpError(400, 'VALIDATION_ERROR', 'Endereço incompleto.');
  }

  const dadosProfissionais = {
    profissao: String(body.profissao || '').trim(),
    empresa: String(body.empresa || '').trim(),
    cargo: String(body.cargo || '').trim(),
    rendaMensal: body.rendaMensal != null ? String(body.rendaMensal).trim() : '',
    tempoTrabalho: String(body.tempoTrabalho || '').trim(),
  };

  if (!hasProfessionalComplete(dadosProfissionais)) {
    throw httpError(400, 'VALIDATION_ERROR', 'Dados profissionais incompletos.');
  }

  const aceitaConsentimentoBiometrico = parseBooleanField(
    body.aceitaConsentimentoBiometrico,
    'aceitaConsentimentoBiometrico'
  );
  const acceptedTerms = parseBooleanField(body.acceptedTerms, 'acceptedTerms');
  const acceptedPrivacyPolicy = parseBooleanField(body.acceptedPrivacyPolicy, 'acceptedPrivacyPolicy');
  const aceitaComunicacoes =
    body.aceitaComunicacoes === undefined
      ? false
      : parseBooleanField(body.aceitaComunicacoes, 'aceitaComunicacoes');

  if (!aceitaConsentimentoBiometrico) {
    throw httpError(400, 'BIOMETRIC_CONSENT_REQUIRED', 'Consentimento biométrico é obrigatório.');
  }
  if (!acceptedTerms) {
    throw httpError(400, 'TERMS_NOT_ACCEPTED', 'É necessário aceitar os termos de uso.');
  }
  if (!acceptedPrivacyPolicy) {
    throw httpError(400, 'PRIVACY_POLICY_NOT_ACCEPTED', 'É necessário aceitar a política de privacidade.');
  }

  return {
    cpf,
    email,
    nomeCompleto: nome,
    telefone,
    dataNascimento,
    senhaPlain,
    enderecoJson: endereco,
    dadosProfissionaisJson: dadosProfissionais,
    aceitaComunicacoes,
    acceptedTerms,
    acceptedPrivacyPolicy,
  };
}

function validateFiles(files) {
  const required = ['documentFront', 'documentBack', 'selfiePortrait'];
  if (identityService.isFaceVideoRequired()) {
    required.push('faceVideo');
  }

  for (const key of required) {
    const f = files[key];
    if (!f || !f.buffer || !f.buffer.length) {
      throw httpError(400, 'ARTIFACT_REQUIRED', `Arquivo obrigatório ausente: ${key}`);
    }
  }

  const map = {
    documentFront: 'DOCUMENT_FRONT',
    documentBack: 'DOCUMENT_BACK',
    selfiePortrait: 'SELFIE_PORTRAIT',
    faceVideo: 'FACE_VIDEO',
  };

  const parsed = {};
  for (const [field, artifactType] of Object.entries(map)) {
    const f = files[field];
    if (!f) continue;
    const mime = (f.mimetype || '').trim().toLowerCase();
    const okMime = identityStorage.validateAllowedMimeType(artifactType, mime);
    if (!okMime.valid) {
      throw httpError(400, okMime.code || 'MIME_NOT_ALLOWED', okMime.message);
    }
    const okSize = identityStorage.validateMaxFileSize(artifactType, f.buffer.length);
    if (!okSize.valid) {
      throw httpError(400, okSize.code || 'SIZE_TOO_LARGE', okSize.message);
    }
    parsed[artifactType] = { buffer: f.buffer, mimeType: okMime.mimeType };
  }

  const requiredTypes = identityService.getRequiredArtifactTypes();
  for (const t of requiredTypes) {
    if (!parsed[t]) {
      throw httpError(400, 'ARTIFACT_REQUIRED', `Documento obrigatório ausente para ${t}`);
    }
  }

  return parsed;
}

function bucketFromEnv() {
  const b = String(process.env.KYC_STORAGE_BUCKET || '').trim();
  if (!b) {
    throw new identityStorage.IdentityStorageDisabledError('KYC_STORAGE_BUCKET', 'Bucket KYC não configurado.');
  }
  return b;
}

async function uploadArtifactForSubmission({
  applicationId,
  submissionId,
  artifactType,
  file,
}) {
  const artifactId = crypto.randomBytes(16).toString('hex');
  const ext = identityStorage.extensionSegmentForMime(artifactType, file.mimeType);
  const objectKey = identityStorage.buildIdentityObjectKey({
    ownerScopeId: applicationId,
    submissionId,
    artifactId,
    artifactType,
    extension: ext,
  });
  const bucket = bucketFromEnv();

  await identityStorage.putObjectBuffer({
    objectKey,
    mimeType: file.mimeType,
    body: file.buffer,
    artifactType,
  });

  return {
    id: artifactId,
    submissionId,
    type: artifactType,
    uploadStatus: 'UPLOAD_CONFIRMED',
    bucket,
    objectKey,
    mimeType: file.mimeType,
    byteSize: file.buffer.length,
  };
}

function buildPublicResponse({ protocolNumber, applicationStatus, message, nextStep }) {
  let status = 'WAIT_REVIEW';
  if (applicationStatus === 'FINALIZED') status = 'FINALIZED';
  else if (applicationStatus === 'RESUBMISSION_REQUIRED') status = 'RESUBMISSION_REQUIRED';

  return {
    success: true,
    protocolNumber,
    status,
    nextStep: nextStep || (status === 'FINALIZED' ? 'LOGIN' : status === 'RESUBMISSION_REQUIRED' ? 'RESTART' : 'WAIT_REVIEW'),
    message,
  };
}

/**
 * @param {{ body: Record<string, unknown>, files: Record<string, { buffer: Buffer, mimetype?: string, originalname?: string }> }} input
 */
async function submitFullOnboardingApplication(input) {
  assertLinearSubmitEnabled();
  assertKycStorageEnabled();

  const fields = parseFields(input.body || {});
  const artifactsByType = validateFiles(input.files || {});

  await noteActiveApplicationDuplicate({ cpf: fields.cpf, email: fields.email });

  const saltRounds = parseInt(process.env.BCRYPT_ROUNDS, 10) || 12;
  const senhaHash = await bcrypt.hash(fields.senhaPlain, saltRounds);

  const now = Date.now();
  const tokenExpiresAt = new Date(now + 24 * 60 * 60 * 1000);
  const expiresAt = new Date(now + 7 * 24 * 60 * 60 * 1000);
  const legacyToken = generateOnboardingToken();
  const tokenHash = hashOnboardingToken(legacyToken);

  const draftRow = {
    nomeCompleto: fields.nomeCompleto,
    email: fields.email,
    cpf: fields.cpf,
    telefone: fields.telefone,
    dataNascimento: fields.dataNascimento,
    senhaHash,
    enderecoJson: fields.enderecoJson,
    dadosProfissionaisJson: fields.dadosProfissionaisJson,
    aceitaComunicacoes: fields.aceitaComunicacoes,
    aceitaTermos: true,
  };

  if (!hasPersonalDataComplete(draftRow)) {
    throw httpError(422, 'APPLICATION_DATA_INCOMPLETE', 'Dados pessoais incompletos.');
  }

  const { application, submission } = await prisma.$transaction(async (tx) => {
    const app = await tx.accountApplication.create({
      data: {
        status: 'DATA_RECEIVED',
        protocolNumber: generateProtocolNumber(),
        tokenHash,
        tokenExpiresAt,
        expiresAt,
        nomeCompleto: draftRow.nomeCompleto,
        email: draftRow.email,
        cpf: draftRow.cpf,
        telefone: draftRow.telefone,
        dataNascimento: draftRow.dataNascimento,
        senhaHash: draftRow.senhaHash,
        enderecoJson: draftRow.enderecoJson,
        dadosProfissionaisJson: draftRow.dadosProfissionaisJson,
        aceitaComunicacoes: draftRow.aceitaComunicacoes,
        aceitaTermos: true,
      },
    });

    const sub = await tx.identitySubmission.create({
      data: {
        accountApplicationId: app.id,
        status: 'PENDING_UPLOADS',
        versionOrAttempt: 1,
      },
    });

    return { application: app, submission: sub };
  });

  const artifactRows = [];
  for (const [artifactType, file] of Object.entries(artifactsByType)) {
    const row = await uploadArtifactForSubmission({
      applicationId: application.id,
      submissionId: submission.id,
      artifactType,
      file,
    });
    artifactRows.push(row);
  }

  await prisma.$transaction(async (tx) => {
    for (const row of artifactRows) {
      await tx.identitySubmissionArtifact.create({ data: row });
    }

    await tx.identitySubmission.update({
      where: { id: submission.id },
      data: {
        status: 'READY_FOR_REVIEW',
        submittedForReviewAt: new Date(),
      },
    });

    await tx.accountApplication.update({
      where: { id: application.id },
      data: { status: 'DOCUMENTS_PENDING' },
    });
  });

  logger.info(
    {
      category: 'operational_audit',
      component: 'onboarding_linear_submit',
      op: 'proposal_submitted',
      applicationIdLen: application.id.length,
      submissionIdLen: submission.id.length,
    },
    'onboarding_linear_submit_received'
  );

  const { autoResult, autoDecisionFailed, autoDecisionCanFinalize } = await runProposalAutoDecision(submission.id);

  let applicationRow = await prisma.accountApplication.findUnique({ where: { id: application.id } });

  if (autoDecisionFailed || !autoResult) {
    return returnWaitReview(applicationRow);
  }

  if (autoResult.recommendation === 'APPROVED' && autoResult.applied && autoDecisionCanFinalize) {
    try {
      const finalizeResult = await onboardingFinalize.finalizeOnboardingApplication(
        applicationRow,
        {
          acceptedTerms: true,
          acceptedPrivacyPolicy: true,
        },
        { sessionId: null }
      );

      applicationRow = await prisma.accountApplication.findUnique({ where: { id: application.id } });

      return buildPublicResponse({
        protocolNumber: applicationRow.protocolNumber,
        applicationStatus: 'FINALIZED',
        message: finalizeResult.message || onboardingFinalize.FINALIZE_PUBLIC_SUCCESS_MESSAGE,
        nextStep: 'LOGIN',
      });
    } catch (err) {
      logger.error(
        {
          category: 'operational_error',
          component: 'onboarding_linear_submit',
          op: 'finalize_after_approved_failed',
          applicationIdLen: application.id.length,
          message: err && err.message ? String(err.message).slice(0, 200) : 'unknown',
        },
        'onboarding_linear_finalize_error'
      );
      return returnWaitReview(applicationRow);
    }
  }

  if (autoResult.recommendation === 'RESUBMISSION_REQUIRED' && autoResult.applied) {
    return buildPublicResponse({
      protocolNumber: applicationRow.protocolNumber,
      applicationStatus: 'RESUBMISSION_REQUIRED',
      message: KYC_PUBLIC_MESSAGES.RESUBMISSION_REQUIRED,
      nextStep: 'RESTART',
    });
  }

  return returnWaitReview(applicationRow);
}

module.exports = {
  isOnboardingLinearSubmitEnabled,
  submitFullOnboardingApplication,
};
