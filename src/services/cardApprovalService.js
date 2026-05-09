const logger = require('../utils/logger');

/** Renda mínima (BRL) para aprovar cartão de crédito. */
const MIN_RENDA_APROVACAO_CARTAO = 1000;

/** Limite aprovado = renda mensal × este fator (valores em reais). */
const LIMITE_MULTIPLICADOR_RENDA = 1.8;

class CardApprovalError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {number} httpStatus
   */
  constructor(code, message, httpStatus = 400) {
    super(message);
    this.name = 'CardApprovalError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

function decimalToNumber(v) {
  if (v === undefined || v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {number} rendaMensal
 * @returns {number|null}
 */
function calcularLimiteCartaoAprovado(rendaMensal) {
  const r = Number(rendaMensal);
  if (!Number.isFinite(r)) return null;
  return Math.round(r * LIMITE_MULTIPLICADOR_RENDA * 100) / 100;
}

function perfilPessoalCompleto(user) {
  if (!user) return false;
  if (!String(user.nomeCompleto || '').trim()) return false;
  if (!String(user.email || '').trim()) return false;
  if (!String(user.cpf || '').trim()) return false;
  if (!String(user.telefone || '').trim()) return false;
  if (!user.dataNascimento) return false;
  const e = user.endereco;
  if (!e) return false;
  if (!String(e.cep || '').trim()) return false;
  if (!String(e.logradouro || '').trim()) return false;
  if (!String(e.numero || '').trim()) return false;
  if (!String(e.bairro || '').trim()) return false;
  if (!String(e.cidade || '').trim()) return false;
  if (!String(e.estado || '').trim()) return false;
  return true;
}

function perfilProfissionalCompleto(user) {
  const d = user && user.dadosProfissionais;
  if (!d) return false;
  if (!String(d.profissao || '').trim()) return false;
  if (!String(d.empresa || '').trim()) return false;
  const rm = decimalToNumber(d.rendaMensal);
  if (rm === null) return false;
  return true;
}

/**
 * Valida titular e regras de negócio para aprovar um cartão pendente.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{ id: string, userId: string, tipo: string }} cartao
 * @returns {Promise<{ limiteAprovado: number, rendaMensal: number }>}
 */
async function validarEObterLimiteAprovacaoCartao(prisma, cartao) {
  const user = await prisma.user.findUnique({
    where: { id: cartao.userId },
    select: {
      id: true,
      nomeCompleto: true,
      email: true,
      cpf: true,
      telefone: true,
      dataNascimento: true,
      isVerificado: true,
      endereco: true,
      dadosProfissionais: true,
    },
  });

  if (!user) {
    throw new CardApprovalError('USER_NOT_FOUND', 'Usuário não encontrado.', 404);
  }

  if (!user.isVerificado) {
    throw new CardApprovalError(
      'ACCOUNT_NOT_VERIFIED',
      'A conta precisa estar verificada para aprovação do cartão.',
      403,
    );
  }

  if (!perfilPessoalCompleto(user) || !perfilProfissionalCompleto(user)) {
    throw new CardApprovalError(
      'CARD_PROFILE_INCOMPLETE',
      'Complete seus dados pessoais e profissionais para análise do cartão.',
      400,
    );
  }

  const rendaMensal = decimalToNumber(user.dadosProfissionais.rendaMensal);
  if (rendaMensal === null || rendaMensal < MIN_RENDA_APROVACAO_CARTAO) {
    throw new CardApprovalError(
      'CARD_INCOME_NOT_ELIGIBLE',
      'A renda mensal informada ainda não permite aprovação do cartão de crédito.',
      400,
    );
  }

  const conflitoUsavel = await prisma.cartao.findFirst({
    where: {
      userId: cartao.userId,
      tipo: cartao.tipo,
      id: { not: cartao.id },
      status: { in: ['ativo', 'aprovado'] },
    },
  });

  if (conflitoUsavel) {
    throw new CardApprovalError(
      'CARD_ACTIVE_ALREADY_EXISTS',
      'Já existe um cartão ativo para esta conta.',
      400,
    );
  }

  const outroPendente = await prisma.cartao.findFirst({
    where: {
      userId: cartao.userId,
      tipo: cartao.tipo,
      id: { not: cartao.id },
      status: 'pendente',
    },
  });

  if (outroPendente) {
    throw new CardApprovalError(
      'CARD_PENDING_ALREADY_EXISTS',
      'Já existe uma solicitação de cartão em análise.',
      400,
    );
  }

  const limiteAprovado = calcularLimiteCartaoAprovado(rendaMensal);
  if (limiteAprovado === null || limiteAprovado <= 0) {
    logger.warn('card_approval_limit_invalid', { userId: user.id, rendaMensal });
    throw new CardApprovalError(
      'CARD_INCOME_NOT_ELIGIBLE',
      'A renda mensal informada ainda não permite aprovação do cartão de crédito.',
      400,
    );
  }

  return { limiteAprovado, rendaMensal };
}

module.exports = {
  CardApprovalError,
  MIN_RENDA_APROVACAO_CARTAO,
  LIMITE_MULTIPLICADOR_RENDA,
  calcularLimiteCartaoAprovado,
  validarEObterLimiteAprovacaoCartao,
};
