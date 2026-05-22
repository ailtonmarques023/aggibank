'use strict';

const crypto = require('crypto');
const { prisma } = require('../config/database');
const {
  normalizeCpfDigits,
  normalizeEmail,
  hasPersonalDataComplete,
  hasAddressComplete,
  hasProfessionalComplete,
  httpError,
} = require('./accountApplicationService');
const { sendEmail } = require('../utils/email');
const logger = require('../utils/logger');

const FINALIZE_PUBLIC_SUCCESS_MESSAGE =
  'Conta criada com sucesso. Enviamos um e-mail para confirmar seu cadastro.';

function isEmailProviderNotConfiguredError(err) {
  return err && (err.code === 'EMAIL_PROVIDER_NOT_CONFIGURED' || err.name === 'EmailProviderNotConfiguredError');
}

function generateAccountNumbers() {
  const numeroConta = Math.floor(100000 + Math.random() * 900000).toString();
  const digitoConta = Math.floor(10 + Math.random() * 90).toString();
  return { numeroConta, digitoConta, agencia: '0001' };
}

function publicDuplicateError(field) {
  if (field === 'email') {
    return httpError(409, 'EMAIL_ALREADY_EXISTS', 'E-mail já cadastrado. Faça login ou use outro e-mail.');
  }
  if (field === 'cpf') {
    return httpError(409, 'CPF_ALREADY_EXISTS', 'CPF já cadastrado. Faça login ou use outro CPF.');
  }
  return httpError(
    409,
    'REGISTER_DUPLICATE',
    'Os dados informados já estão vinculados a uma conta. Faça login ou altere-os.'
  );
}

async function assertNoExistingUser({ cpf, email }) {
  const normalizedCpf = normalizeCpfDigits(cpf);
  const normalizedEmail = normalizeEmail(email);

  if (normalizedCpf) {
    const byCpf = await prisma.user.findUnique({
      where: { cpf: normalizedCpf },
      select: { id: true },
    });
    if (byCpf) throw publicDuplicateError('cpf');
  }

  if (normalizedEmail) {
    const byEmail = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });
    if (byEmail) throw publicDuplicateError('email');
  }
}

function validateApplicationDataComplete(applicationRow) {
  if (!hasPersonalDataComplete(applicationRow)) {
    throw httpError(
      422,
      'APPLICATION_DATA_INCOMPLETE',
      'Complete seus dados pessoais antes de finalizar a abertura.'
    );
  }
  if (!hasAddressComplete(applicationRow.enderecoJson)) {
    throw httpError(422, 'APPLICATION_ADDRESS_INCOMPLETE', 'Informe o endereço completo antes de finalizar.');
  }
  if (!hasProfessionalComplete(applicationRow.dadosProfissionaisJson)) {
    throw httpError(
      422,
      'APPLICATION_PROFESSIONAL_INCOMPLETE',
      'Informe seus dados profissionais antes de finalizar.'
    );
  }
}

function buildUserCreatePayload(applicationRow, accountNumbers) {
  const email = normalizeEmail(applicationRow.email);
  const cpf = normalizeCpfDigits(applicationRow.cpf);
  const endereco = applicationRow.enderecoJson;
  const prof = applicationRow.dadosProfissionaisJson;
  const tokenVerificacao = crypto.randomBytes(32).toString('hex');

  return {
    nomeCompleto: applicationRow.nomeCompleto,
    email,
    cpf,
    telefone: applicationRow.telefone,
    dataNascimento: applicationRow.dataNascimento,
    senha: applicationRow.senhaHash,
    numeroConta: accountNumbers.numeroConta,
    digitoConta: accountNumbers.digitoConta,
    agencia: accountNumbers.agencia,
    tokenVerificacao,
    isVerificado: false,
    identityReviewStatus: 'APPROVED',
    identityApprovedAt: new Date(),
    limitePixDiario: 1000,
    limitePixMensal: 10000,
    endereco: {
      create: {
        cep: endereco.cep,
        logradouro: endereco.logradouro,
        numero: endereco.numero,
        complemento: endereco.complemento || '',
        bairro: endereco.bairro,
        cidade: endereco.cidade,
        estado: endereco.estado,
        pais: 'Brasil',
      },
    },
    dadosProfissionais: {
      create: {
        profissao: prof.profissao,
        empresa: prof.empresa || '',
        cargo: prof.cargo || '',
        rendaMensal: prof.rendaMensal != null ? parseFloat(prof.rendaMensal) : null,
        tempoTrabalho: prof.tempoTrabalho || '',
      },
    },
    configuracoes: {
      create: {
        notificacoesEmail: true,
        notificacoesSms: true,
        notificacoesPush: true,
        temaInterface: 'claro',
        idioma: 'pt-BR',
      },
    },
  };
}

/**
 * @param {import('@prisma/client').AccountApplication} applicationRow
 * @param {{ acceptedTerms: boolean, acceptedPrivacyPolicy: boolean }} body
 * @param {{ sessionId: string }} context
 */
async function finalizeOnboardingApplication(applicationRow, body, context) {
  const appId = applicationRow.id;

  if (applicationRow.status === 'FINALIZED' && applicationRow.userId) {
    return {
      idempotent: true,
      userId: applicationRow.userId,
      nextStep: 'LOGIN',
      message: FINALIZE_PUBLIC_SUCCESS_MESSAGE,
      verificationEmail: { status: 'skipped' },
    };
  }

  if (applicationRow.status !== 'DOCUMENTS_APPROVED') {
    const codeByStatus = {
      DRAFT: 'APPLICATION_NOT_READY',
      DOCUMENTS_PENDING: 'DOCUMENTS_NOT_APPROVED',
      RESUBMISSION_REQUIRED: 'DOCUMENTS_RESUBMISSION_REQUIRED',
      REJECTED: 'APPLICATION_REJECTED',
      EXPIRED: 'APPLICATION_EXPIRED',
      CANCELLED: 'APPLICATION_CANCELLED',
    };
    const code = codeByStatus[applicationRow.status] || 'APPLICATION_NOT_READY';
    throw httpError(
      409,
      code,
      'Não é possível finalizar a proposta neste momento. Verifique o status da abertura.'
    );
  }

  if (body.acceptedTerms !== true) {
    throw httpError(400, 'TERMS_NOT_ACCEPTED', 'É necessário aceitar os termos de uso.');
  }
  if (body.acceptedPrivacyPolicy !== true) {
    throw httpError(400, 'PRIVACY_POLICY_NOT_ACCEPTED', 'É necessário aceitar a política de privacidade.');
  }

  validateApplicationDataComplete(applicationRow);
  await assertNoExistingUser({
    cpf: applicationRow.cpf,
    email: applicationRow.email,
  });

  const approvedSubmission = await prisma.identitySubmission.findFirst({
    where: {
      accountApplicationId: appId,
      status: 'APPROVED',
      userId: null,
    },
    orderBy: { decidedAt: 'desc' },
  });

  if (!approvedSubmission) {
    throw httpError(
      422,
      'IDENTITY_NOT_APPROVED',
      'Documentos da proposta ainda não foram aprovados para conclusão.'
    );
  }

  const accountNumbers = generateAccountNumbers();
  const now = new Date();

  const txResult = await prisma.$transaction(async (tx) => {
    const locked = await tx.accountApplication.updateMany({
      where: {
        id: appId,
        status: 'DOCUMENTS_APPROVED',
        userId: null,
      },
      data: {
        aceitaTermos: true,
        status: 'FINALIZED',
        finalizedAt: now,
      },
    });

    if (locked.count === 0) {
      const current = await tx.accountApplication.findUnique({ where: { id: appId } });
      if (current && current.status === 'FINALIZED' && current.userId) {
        return { idempotent: true, userId: current.userId };
      }
      throw httpError(409, 'FINALIZE_CONFLICT', 'Não foi possível concluir a abertura neste momento.');
    }

    const user = await tx.user.create({
      data: {
        ...buildUserCreatePayload(applicationRow, accountNumbers),
        lastIdentitySubmissionId: approvedSubmission.id,
      },
      select: {
        id: true,
        email: true,
        nomeCompleto: true,
        numeroConta: true,
        digitoConta: true,
        agencia: true,
        tokenVerificacao: true,
        isVerificado: false,
        identityReviewStatus: true,
      },
    });

    await tx.identitySubmission.update({
      where: { id: approvedSubmission.id },
      data: {
        userId: user.id,
        accountApplicationId: null,
      },
    });

    await tx.accountApplication.update({
      where: { id: appId },
      data: { userId: user.id },
    });

    await tx.onboardingSession.updateMany({
      where: {
        id: context.sessionId,
        applicationId: appId,
        status: 'ACTIVE',
      },
      data: { status: 'COMPLETED' },
    });

    return { idempotent: false, user };
  });

  if (txResult.idempotent) {
    return {
      idempotent: true,
      userId: txResult.userId,
      nextStep: 'LOGIN',
      message: FINALIZE_PUBLIC_SUCCESS_MESSAGE,
      verificationEmail: { status: 'skipped' },
    };
  }

  const user = txResult.user;

  logger.info(
    {
      category: 'operational_audit',
      component: 'onboarding_finalize_service',
      op: 'onboarding_finalize_completed',
      applicationIdLen: appId.length,
      userIdLen: user.id.length,
      protocolNumberLen: applicationRow.protocolNumber ? applicationRow.protocolNumber.length : 0,
    },
    'onboarding_finalize_completed'
  );

  let verificationEmail = { status: 'sent' };
  try {
    await sendEmail({
      to: user.email,
      subject: 'Bem-vindo ao AgilBank - Verifique sua conta',
      template: 'welcome',
      data: {
        nome: user.nomeCompleto,
        token: user.tokenVerificacao,
        numeroConta: `${user.numeroConta}-${user.digitoConta}`,
        agencia: user.agencia,
      },
    });
  } catch (emailError) {
    if (isEmailProviderNotConfiguredError(emailError)) {
      verificationEmail = {
        status: 'not_configured',
        code: 'EMAIL_PROVIDER_NOT_CONFIGURED',
      };
    } else {
      verificationEmail = {
        status: 'failed',
        code: 'EMAIL_SEND_FAILED',
      };
    }
    logger.warn(emailError, {
      context: 'onboarding-finalize-verification-email',
      userIdLen: user.id.length,
    });
  }

  return {
    idempotent: false,
    userId: user.id,
    nextStep: 'LOGIN',
    message: FINALIZE_PUBLIC_SUCCESS_MESSAGE,
    verificationEmail,
  };
}

module.exports = {
  FINALIZE_PUBLIC_SUCCESS_MESSAGE,
  finalizeOnboardingApplication,
};
