const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { prisma } = require('../config/database');
const {
  generateToken,
  generateRefreshToken,
  verifyRefreshToken,
  hashRefreshToken,
  hashOpaqueToken,
  authenticateToken,
} = require('../middleware/auth');
const {
  validateUserRegistration,
  validateLogin,
  validateForgotPassword,
  validateVerifyResetToken,
  validateResetPassword,
} = require('../middleware/validation');
const logger = require('../utils/logger');
const { sendEmail, sendPasswordResetEmail } = require('../utils/email');
const { recordAudit } = require('../utils/auditLog');
const { isRedisAvailable, getRedis } = require('../utils/redis');
const {
  attachReferralToNewUser,
  qualifyReferralForVerifiedUser,
} = require('../services/referralService');

const router = express.Router();
const CPF_LOGIN_REGEX = /^\d{11}$/;
const loginAttempts = new Map();

/** Cooldown por usuário (memória; em cluster usar Redis ou campo no banco). */
const resendVerificationCooldown = new Map();

function resendVerificationMinIntervalMs() {
  if (process.env.NODE_ENV === 'test') return 0;
  return parseInt(process.env.RESEND_VERIFICATION_COOLDOWN_MS, 10) || 90 * 1000;
}

const FORGOT_PASSWORD_PUBLIC_MESSAGE =
  'Se os dados estiverem corretos, enviaremos as instruções para o e-mail cadastrado.';

const RESET_TOKEN_INVALID_MESSAGE = 'Token inválido ou expirado.';

/**
 * Campos UNIQUE do modelo `User` (Prisma) sob violação P2002.
 */
function extractDuplicateSchemaFields(metaTarget) {
  if (metaTarget == null) return [];
  const list = Array.isArray(metaTarget) ? metaTarget : [metaTarget];
  const canonical = [];

  function add(kind) {
    if (!canonical.includes(kind)) canonical.push(kind);
  }

  for (const entry of list) {
    const rawEntry = typeof entry === 'string' ? entry : String(entry);
    const s = rawEntry.toLowerCase().trim();
    if (!s) continue;
    const compact = s.replace(/^usuarios?\.?/, '').replace(/_key$/i, '').replace(/_unique$/i, '');

    /** Prisma (PostgreSQL) costuma usar os nomes exatos das colunas mapeadas. */
    const candidates = [...new Set([s, compact, compact.split(/\W+/).filter(Boolean).join(' ')])].join('|');

    if (/\bemail\b|_email|\.email\b|email$/i.test(candidates)) {
      add('email');
    }
    if (/\bcpf\b|_cpf|\.cpf\b|cpf$/i.test(candidates)) {
      add('cpf');
    }
    if (/numeroconta|numero_conta|numeroconta$/i.test(candidates)) {
      add('numeroConta');
    }
  }

  return canonical;
}

/** Resposta JSON para cadastro quando viola constraint UNIQUE (P2002). */
function conflictFromRegisterDuplicates(metaTarget) {
  const fields = extractDuplicateSchemaFields(metaTarget);

  const hasEmail = fields.includes('email');
  const hasCpf = fields.includes('cpf');
  const hasNumeroConta = fields.includes('numeroConta');

  let duplicateField = null;
  let code = 'REGISTER_DUPLICATE';
  let message = 'Os dados informados já estão vinculados a uma conta. Faça login ou altere-os.';

  if (hasEmail && hasCpf) {
    duplicateField = 'email;cpf';
    code = 'EMAIL_AND_CPF_ALREADY_EXIST';
    message = 'E-mail e CPF já cadastrados. Verifique os dados ou faça login.';
  } else if (hasEmail) {
    duplicateField = 'email';
    code = 'EMAIL_ALREADY_EXISTS';
    message = 'E-mail já cadastrado. Faça login ou use outro e-mail.';
  } else if (hasCpf) {
    duplicateField = 'cpf';
    code = 'CPF_ALREADY_EXISTS';
    message = 'CPF já cadastrado. Faça login ou use outro CPF.';
  } else if (hasNumeroConta) {
    duplicateField = 'numeroConta';
    code = 'NUMERO_CONTA_CONFLICT';
    message = 'Não foi possível gerar uma conta agora. Tente novamente.';
  } else if (fields.length === 1) {
    duplicateField = fields[0];
    code = `DUPLICATE_${String(fields[0]).toUpperCase()}`;
    message = 'Não foi possível concluir o cadastro. Confira seus dados ou tente novamente em instantes.';
  } else {
    message =
      'Não foi possível concluir o cadastro porque alguns dados já estão em uso. Verifique suas informações ou faça login.';
    code = 'REGISTER_DUPLICATE';
  }

  logger.security('registration_duplicate', {
    prismaTarget: metaTarget,
    fields,
    duplicateField,
    code,
    clientMessage: message,
  });

  /** Sem `fields`/detalhes técnicos do Prisma no JSON enviado ao cliente. */
  return {
    success: false,
    message,
    code,
    duplicateField,
  };
}

/** Resposta alinhada ao contrato de erro de envio (Resend oficial; SMTP legado opcional). */
function emailProviderMisconfiguredMessage() {
  return 'O servidor não está configurado para enviar e-mail. Em produção configure RESEND_API_KEY e EMAIL_FROM (domínio verificado no Resend). SMTP legado exige ALLOW_EMAIL_SMTP_FALLBACK=true apenas se a infraestrutura permitir saída SMTP.';
}

function isEmailProviderNotConfiguredError(err) {
  const msg = err && err.message ? String(err.message) : '';
  return msg === 'EMAIL_PROVIDER_NOT_CONFIGURED' || msg === 'SMTP_NOT_CONFIGURED';
}

function loginAttemptsMaxFailures() {
  return parseInt(process.env.AUTH_MAX_FAILED_ATTEMPTS, 10) || 5;
}

function loginAttemptsWindowMs() {
  return parseInt(process.env.AUTH_FAILED_WINDOW_MS, 10) || 15 * 60 * 1000;
}

function loginAttemptsBlockMs() {
  return parseInt(process.env.AUTH_BLOCK_DURATION_MS, 10) || 15 * 60 * 1000;
}

function loginAttemptKey(req, loginIdentifier) {
  const ip = req.ip || 'unknown-ip';
  const material = `${ip}:${loginIdentifier.type}:${loginIdentifier.value}`;
  const hashed = crypto.createHash('sha256').update(material).digest('hex');
  return `auth:bf:${hashed}`;
}

let redisFallbackWarned = false;
function warnRedisFallback(reason) {
  if (redisFallbackWarned) return;
  redisFallbackWarned = true;
  logger.warn('Fallback de brute force em memoria', {
    category: 'operational_error',
    component: 'auth_bruteforce',
    reason,
  });
}

async function getLoginAttemptState(key) {
  if (isRedisAvailable()) {
    try {
      const redis = getRedis();
      const raw = await redis.hgetall(key);
      if (!raw || Object.keys(raw).length === 0) {
        return { blockedUntil: 0, count: 0, firstFailureAt: 0 };
      }
      return {
        blockedUntil: parseInt(raw.blockedUntil || '0', 10) || 0,
        count: parseInt(raw.count || '0', 10) || 0,
        firstFailureAt: parseInt(raw.firstFailureAt || '0', 10) || 0,
      };
    } catch (error) {
      warnRedisFallback('redis_read_failed');
    }
  } else {
    warnRedisFallback(process.env.REDIS_URL ? 'redis_unavailable' : 'redis_not_configured');
  }

  const now = Date.now();
  const state = loginAttempts.get(key);
  if (!state) {
    return { blockedUntil: 0, count: 0, firstFailureAt: 0 };
  }

  const withinWindow = state.firstFailureAt && now - state.firstFailureAt <= loginAttemptsWindowMs();
  if (!withinWindow && now > (state.blockedUntil || 0)) {
    loginAttempts.delete(key);
    return { blockedUntil: 0, count: 0, firstFailureAt: 0 };
  }

  return state;
}

async function registerLoginFailure(key) {
  const now = Date.now();
  const state = await getLoginAttemptState(key);
  const count = (state.count || 0) + 1;
  const firstFailureAt = state.firstFailureAt || now;
  const nextState = { count, firstFailureAt, blockedUntil: state.blockedUntil || 0 };
  if (count >= loginAttemptsMaxFailures()) {
    nextState.blockedUntil = now + loginAttemptsBlockMs();
  }

  if (isRedisAvailable()) {
    try {
      const redis = getRedis();
      await redis.hset(key, {
        count: String(nextState.count),
        firstFailureAt: String(nextState.firstFailureAt),
        blockedUntil: String(nextState.blockedUntil),
      });
      const ttlSeconds = Math.ceil(Math.max(loginAttemptsWindowMs(), loginAttemptsBlockMs()) / 1000);
      await redis.expire(key, ttlSeconds);
      return nextState;
    } catch (error) {
      warnRedisFallback('redis_write_failed');
    }
  }

  loginAttempts.set(key, nextState);
  return nextState;
}

async function clearLoginFailures(key) {
  if (isRedisAvailable()) {
    try {
      const redis = getRedis();
      await redis.del(key);
      return;
    } catch (error) {
      warnRedisFallback('redis_delete_failed');
    }
  }
  loginAttempts.delete(key);
}

/** Garante JSON serializável (evita surpresas com Decimal em alguns runtimes). */
function asJsonNumber(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'number') return value;
  return Number(value);
}

function toPublicEndereco(e) {
  if (!e) return null;
  return {
    id: e.id,
    userId: e.userId,
    cep: e.cep,
    logradouro: e.logradouro,
    numero: e.numero,
    complemento: e.complemento,
    bairro: e.bairro,
    cidade: e.cidade,
    estado: e.estado,
    pais: e.pais,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
}

function toPublicDadosProfissionais(d) {
  if (!d) return null;
  return {
    id: d.id,
    userId: d.userId,
    profissao: d.profissao,
    empresa: d.empresa,
    cargo: d.cargo,
    rendaMensal: d.rendaMensal == null ? null : asJsonNumber(d.rendaMensal),
    tempoTrabalho: d.tempoTrabalho,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

function toPublicConfiguracoes(c) {
  if (!c) return null;
  return {
    id: c.id,
    userId: c.userId,
    notificacoesEmail: c.notificacoesEmail,
    notificacoesSms: c.notificacoesSms,
    notificacoesPush: c.notificacoesPush,
    temaInterface: c.temaInterface,
    idioma: c.idioma,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

const toPublicRegisterUser = (user) => ({
  id: user.id,
  nomeCompleto: user.nomeCompleto,
  email: user.email,
  cpf: user.cpf,
  telefone: user.telefone,
  dataNascimento: user.dataNascimento,
  saldoAtual: asJsonNumber(user.saldoAtual),
  saldoBloqueado: asJsonNumber(user.saldoBloqueado == null ? 0 : user.saldoBloqueado),
  limiteCartao: user.limiteCartao == null ? null : asJsonNumber(user.limiteCartao),
  limitePixDiario: user.limitePixDiario == null ? null : asJsonNumber(user.limitePixDiario),
  limitePixMensal: user.limitePixMensal == null ? null : asJsonNumber(user.limitePixMensal),
  scoreCredito: user.scoreCredito,
  numeroConta: user.numeroConta,
  digitoConta: user.digitoConta,
  agencia: user.agencia,
  isAtivo: user.isAtivo,
  isVerificado: user.isVerificado,
  dataVerificacao: user.dataVerificacao,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
  endereco: toPublicEndereco(user.endereco),
  dadosProfissionais: toPublicDadosProfissionais(user.dadosProfissionais),
  configuracoes: toPublicConfiguracoes(user.configuracoes),
});

const getLoginIdentifier = (body) => {
  const rawIdentifier = body.identificador || body.email;
  const identifier = typeof rawIdentifier === 'string' ? rawIdentifier.trim() : '';

  if (CPF_LOGIN_REGEX.test(identifier)) {
    return {
      type: 'cpf',
      value: identifier.replace(/\D/g, ''),
    };
  }

  return {
    type: 'email',
    value: identifier.toLowerCase(),
  };
};

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Registrar novo usuário
 *     tags: [Autenticação]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterRequest'
 *     responses:
 *       201:
 *         description: Usuário registrado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         description: Dados inválidos
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/register', validateUserRegistration, async (req, res) => {
  try {
    const { nomeCompleto, email, cpf, telefone, dataNascimento, senha, endereco, dadosProfissionais, referralCode } = req.body;

    // Criptografar senha
    const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
    const senhaHash = await bcrypt.hash(senha, saltRounds);

    // Gerar número de conta único
    const numeroConta = Math.floor(100000 + Math.random() * 900000).toString();
    const digitoConta = Math.floor(10 + Math.random() * 90).toString();
    const agencia = '0001';

    // Gerar token de verificação
    const tokenVerificacao = crypto.randomBytes(32).toString('hex');

    // Transação explícita: User + Endereco + DadosProfissionais + Configuracoes em commit único
    const user = await prisma.$transaction((tx) =>
      tx.user.create({
        data: {
          nomeCompleto,
          email,
          cpf,
          telefone,
          dataNascimento: new Date(dataNascimento),
          senha: senhaHash,
          numeroConta,
          digitoConta,
          agencia,
          tokenVerificacao,
          limitePixDiario: 1000,
          limitePixMensal: 10000,
          endereco: endereco ? {
            create: {
              cep: endereco.cep,
              logradouro: endereco.logradouro,
              numero: endereco.numero,
              complemento: endereco.complemento || '',
              bairro: endereco.bairro,
              cidade: endereco.cidade,
              estado: endereco.estado,
              pais: 'Brasil'
            }
          } : undefined,
          dadosProfissionais: dadosProfissionais ? {
            create: {
              profissao: dadosProfissionais.profissao,
              empresa: dadosProfissionais.empresa || '',
              cargo: dadosProfissionais.cargo || '',
              rendaMensal: dadosProfissionais.rendaMensal ? parseFloat(dadosProfissionais.rendaMensal) : null,
              tempoTrabalho: dadosProfissionais.tempoTrabalho || ''
            }
          } : undefined,
          configuracoes: {
            create: {
              notificacoesEmail: true,
              notificacoesSms: true,
              notificacoesPush: true,
              temaInterface: 'claro',
              idioma: 'pt-BR',
            }
          }
        },
        include: {
          endereco: true,
          dadosProfissionais: true,
          configuracoes: true
        }
      })
    );

    const publicUser = toPublicRegisterUser(user);

    let referral = { status: 'none' };
    if (referralCode) {
      const attached = await attachReferralToNewUser({
        referredUserId: user.id,
        referralCode,
      });
      referral = attached
        ? { status: 'registered', code: attached.referralCode }
        : { status: 'ignored' };
    }

    logger.banking('user_registration', user.id, {
      email,
      numeroConta: `${numeroConta}-${digitoConta}`,
    });

    let verificationEmail = { status: 'sent' };
    try {
      await sendEmail({
        to: email,
        subject: 'Bem-vindo ao AgilBank - Verifique sua conta',
        template: 'welcome',
        data: {
          nome: nomeCompleto,
          token: tokenVerificacao,
          numeroConta: `${numeroConta}-${digitoConta}`,
          agencia,
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
        context: 'register-verification-email',
        to: email,
      });
    }

    res.status(201).json({
      success: true,
      message: 'Usuário registrado com sucesso. Verifique seu email para ativar a conta.',
      data: {
        user: publicUser,
        message: 'Verifique seu email para ativar sua conta',
        verificationEmail,
        referral,
      },
    });

  } catch (error) {
    if (error.code === 'P2002') {
      logger.warn(
        { prismaCode: error.code, meta: error.meta },
        'register_prisma_unique_violation_detail'
      );
      return res.status(409).json(conflictFromRegisterDuplicates(error.meta?.target));
    }

    logger.error('Erro no registro:', error);
    res.status(500).json({
      success: false,
      message: 'Não foi possível concluir o cadastro no momento. Tente novamente mais tarde.',
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Fazer login
 *     tags: [Autenticação]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *     responses:
 *       200:
 *         description: Login realizado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LoginResponse'
 *       401:
 *         description: Credenciais inválidas
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/login', validateLogin, async (req, res) => {
  try {
    const { senha } = req.body;
    const loginIdentifier = getLoginIdentifier(req.body);
    const attemptKey = loginAttemptKey(req, loginIdentifier);
    const attemptState = await getLoginAttemptState(attemptKey);
    const now = Date.now();

    if (attemptState.blockedUntil && attemptState.blockedUntil > now) {
      logger.security('login_blocked_bruteforce', {
        identifierType: loginIdentifier.type,
        ip: req.ip,
      });
      return res.status(429).json({
        success: false,
        message: 'Muitas tentativas inválidas. Aguarde alguns minutos antes de tentar novamente.',
        code: 'AUTH_RATE_LIMITED',
        category: 'operational_error',
      });
    }

    // Buscar usuário
    const user = await prisma.user.findUnique({
      where: { [loginIdentifier.type]: loginIdentifier.value },
      include: {
        configuracoes: true
      }
    });

    if (!user) {
      await registerLoginFailure(attemptKey);
      logger.security('login_failed', { identifierType: loginIdentifier.type, reason: 'user_not_found' });
      return res.status(401).json({
        success: false,
        message: 'Conta não encontrada. Abra sua conta AgilBank.',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // Verificar senha
    const senhaValida = await bcrypt.compare(senha, user.senha);
    if (!senhaValida) {
      await registerLoginFailure(attemptKey);
      logger.security('login_failed', { identifierType: loginIdentifier.type, reason: 'invalid_password' });
      return res.status(401).json({
        success: false,
        message: 'Senha incorreta. Confira os 6 dígitos.',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // Verificar se conta está ativa
    if (!user.isAtivo) {
      await registerLoginFailure(attemptKey);
      logger.security('login_failed', { userId: user.id, reason: 'account_inactive' });
      return res.status(401).json({
        success: false,
        message: 'Conta desativada',
        code: 'ACCOUNT_DEACTIVATED'
      });
    }

    await clearLoginFailures(attemptKey);

    // Gerar tokens
    const token = generateToken(user.id);
    const refreshToken = generateRefreshToken(user.id);

    const tokenHash = hashRefreshToken(refreshToken);
    await prisma.token.create({
      data: {
        userId: user.id,
        tokenHash,
        tipo: 'refresh',
        expiraEm: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 dias
      },
    });

    // Remover senha da resposta
    const { senha: _, ...userWithoutPassword } = user;

    logger.banking('user_login', user.id, {
      email: user.email,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });

    await recordAudit({
      userId: user.id,
      action: 'auth.login_success',
      entity: 'User',
      entityId: user.id,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });

    res.json({
      success: true,
      message: 'Login realizado com sucesso',
      data: {
        user: userWithoutPassword,
        token,
        refreshToken
      }
    });

  } catch (error) {
    logger.security('login_operational_failure', {
      reason: 'exception',
      ip: req.ip,
    });
    logger.error('Erro no login:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * @swagger
 * /api/auth/refresh:
 *   post:
 *     summary: Renovar token de acesso
 *     tags: [Autenticação]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *         schema:
 *           type: object
 *           properties:
 *             refreshToken:
 *               type: string
 *               description: Token de refresh
 *     responses:
 *       200:
 *         description: Token renovado com sucesso
 *       401:
 *         description: Refresh token inválido
 */
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        message: 'Refresh token é obrigatório',
        code: 'REFRESH_TOKEN_REQUIRED'
      });
    }

    const decoded = verifyRefreshToken(refreshToken);
    const tokenHash = hashRefreshToken(refreshToken);

    const tokenRecord = await prisma.token.findFirst({
      where: {
        tokenHash,
        userId: decoded.userId,
        tipo: 'refresh',
        isAtivo: true,
        expiraEm: {
          gt: new Date(),
        },
      },
      include: {
        user: {
          select: {
            id: true,
            nomeCompleto: true,
            email: true,
            isAtivo: true,
          },
        },
      },
    });

    if (!tokenRecord) {
      return res.status(401).json({
        success: false,
        message: 'Refresh token inválido ou expirado',
        code: 'INVALID_REFRESH_TOKEN',
      });
    }

    if (!tokenRecord.user.isAtivo) {
      return res.status(401).json({
        success: false,
        message: 'Conta desativada',
        code: 'ACCOUNT_DEACTIVATED',
      });
    }

    const newToken = generateToken(tokenRecord.user.id);

    await recordAudit({
      userId: tokenRecord.user.id,
      action: 'auth.refresh_used',
      entity: 'Token',
      entityId: tokenRecord.id,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });

    res.json({
      success: true,
      message: 'Token renovado com sucesso',
      data: {
        token: newToken
      }
    });

  } catch (error) {
    logger.error('Erro ao renovar token:', error);
    res.status(401).json({
      success: false,
      message: 'Refresh token inválido',
      code: 'INVALID_REFRESH_TOKEN'
    });
  }
});

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Fazer logout
 *     tags: [Autenticação]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logout realizado com sucesso
 */
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    await prisma.token.updateMany({
      where: {
        userId: req.user.id,
        tipo: 'refresh',
        isAtivo: true,
      },
      data: {
        isAtivo: false,
      },
    });

    logger.banking('user_logout', req.user.id);

    await recordAudit({
      userId: req.user.id,
      action: 'auth.logout',
      entity: 'User',
      entityId: req.user.id,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });

    res.json({
      success: true,
      message: 'Logout realizado com sucesso',
    });

  } catch (error) {
    logger.error('Erro no logout:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * @swagger
 * /api/auth/verify-email:
 *   post:
 *     summary: Verificar email
 *     tags: [Autenticação]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *         schema:
 *           type: object
 *           properties:
 *             token:
 *               type: string
 *               description: Token de verificação
 *     responses:
 *       200:
 *         description: Email verificado com sucesso
 *       400:
 *         description: Token inválido
 */
/**
 * @swagger
 * /api/auth/forgot-password:
 *   post:
 *     summary: Solicitar instruções de redefinição de senha
 *     tags: [Autenticação]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, cpf]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               cpf:
 *                 type: string
 *                 description: CPF com 11 dígitos
 *     responses:
 *       200:
 *         description: Resposta genérica (não indica se o usuário existe)
 */
router.post('/forgot-password', validateForgotPassword, async (req, res) => {
  const genericResponse = () =>
    res.status(200).json({
      success: true,
      message: FORGOT_PASSWORD_PUBLIC_MESSAGE,
    });

  try {
    const email = String(req.body.email || '')
      .trim()
      .toLowerCase();
    const cpf = String(req.body.cpf || '').replace(/\D/g, '');

    const user = await prisma.user.findFirst({
      where: {
        email,
        cpf,
      },
      select: {
        id: true,
        nomeCompleto: true,
        email: true,
      },
    });

    if (!user) {
      logger.security('password_reset_forgot', { reason: 'no_user_match', emailRedacted: true });
      return genericResponse();
    }

    await prisma.token.updateMany({
      where: {
        userId: user.id,
        tipo: 'password_reset',
        isAtivo: true,
      },
      data: { isAtivo: false },
    });

    const plainToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashOpaqueToken(plainToken);
    const expiraEm = new Date(Date.now() + 60 * 60 * 1000);

    await prisma.token.create({
      data: {
        userId: user.id,
        tokenHash,
        tipo: 'password_reset',
        expiraEm,
        isAtivo: true,
      },
    });

    try {
      await sendPasswordResetEmail({
        nome: user.nomeCompleto,
        email: user.email,
        token: plainToken,
      });
    } catch (emailError) {
      logger.warn(emailError, {
        context: 'forgot-password-send',
        userId: user.id,
        emailSendFailed: true,
        providerNotConfigured: isEmailProviderNotConfiguredError(emailError),
      });
    }

    logger.banking('password_reset_requested', user.id, { email: user.email });

    return genericResponse();
  } catch (error) {
    logger.error('Erro em forgot-password:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR',
    });
  }
});

/**
 * @swagger
 * /api/auth/verify-reset-token:
 *   post:
 *     summary: Validar token de redefinição de senha
 *     tags: [Autenticação]
 */
router.post('/verify-reset-token', validateVerifyResetToken, async (req, res) => {
  try {
    const { token } = req.body;
    const tokenHash = hashOpaqueToken(token);
    const now = new Date();

    const record = await prisma.token.findFirst({
      where: {
        tokenHash,
        tipo: 'password_reset',
        isAtivo: true,
        expiraEm: { gt: now },
      },
      include: {
        user: {
          select: {
            nomeCompleto: true,
            isAtivo: true,
          },
        },
      },
    });

    if (!record || !record.user?.isAtivo) {
      return res.status(200).json({
        valid: false,
        message: RESET_TOKEN_INVALID_MESSAGE,
      });
    }

    return res.status(200).json({
      valid: true,
      nome: record.user.nomeCompleto,
    });
  } catch (error) {
    logger.error('Erro em verify-reset-token:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR',
    });
  }
});

/**
 * @swagger
 * /api/auth/reset-password:
 *   post:
 *     summary: Definir nova senha com token de redefinição
 *     tags: [Autenticação]
 */
router.post('/reset-password', validateResetPassword, async (req, res) => {
  try {
    const { token, new_password: newPassword } = req.body;
    const tokenHash = hashOpaqueToken(token);
    const now = new Date();

    const record = await prisma.token.findFirst({
      where: {
        tokenHash,
        tipo: 'password_reset',
        isAtivo: true,
        expiraEm: { gt: now },
      },
      include: {
        user: {
          select: {
            id: true,
            isAtivo: true,
          },
        },
      },
    });

    if (!record || !record.user?.isAtivo) {
      return res.status(400).json({
        success: false,
        message: RESET_TOKEN_INVALID_MESSAGE,
        code: 'INVALID_RESET_TOKEN',
      });
    }

    const saltRounds = parseInt(process.env.BCRYPT_ROUNDS, 10) || 12;
    const senhaHash = await bcrypt.hash(newPassword, saltRounds);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.user.id },
        data: { senha: senhaHash },
      }),
      prisma.token.update({
        where: { id: record.id },
        data: { isAtivo: false },
      }),
      prisma.token.updateMany({
        where: {
          userId: record.user.id,
          tipo: 'refresh',
          isAtivo: true,
        },
        data: { isAtivo: false },
      }),
    ]);

    logger.banking('password_reset_completed', record.user.id, {});

    await recordAudit({
      userId: record.user.id,
      action: 'auth.password_reset_success',
      entity: 'User',
      entityId: record.user.id,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });

    return res.status(200).json({
      success: true,
      message: 'Senha redefinida com sucesso.',
    });
  } catch (error) {
    logger.error('Erro em reset-password:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR',
    });
  }
});

/**
 * Usuário autenticado mas ainda não verificado: gera novo token e reenvia o e-mail de boas-vindas.
 * Não usa requireVerification (justamente para quem ainda não verificou).
 */
router.post('/resend-verification-email', authenticateToken, async (req, res) => {
  try {
    if (req.user.isVerificado) {
      return res.status(400).json({
        success: false,
        message: 'Sua conta já está verificada.',
        code: 'ALREADY_VERIFIED',
      });
    }

    const minMs = resendVerificationMinIntervalMs();
    const now = Date.now();
    const last = resendVerificationCooldown.get(req.user.id);
    if (minMs > 0 && last != null && now - last < minMs) {
      const waitSec = Math.ceil((minMs - (now - last)) / 1000);
      return res.status(429).json({
        success: false,
        message: `Aguarde ${waitSec} segundos antes de pedir outro e-mail de verificação.`,
        code: 'RESEND_RATE_LIMIT',
      });
    }

    const tokenVerificacao = crypto.randomBytes(32).toString('hex');

    await prisma.user.update({
      where: { id: req.user.id },
      data: { tokenVerificacao },
    });

    resendVerificationCooldown.set(req.user.id, now);

    try {
      await sendEmail({
        to: req.user.email,
        subject: 'Bem-vindo ao AgilBank - Verifique sua conta',
        template: 'welcome',
        data: {
          nome: req.user.nomeCompleto,
          token: tokenVerificacao,
          numeroConta: `${req.user.numeroConta}-${req.user.digitoConta}`,
          agencia: req.user.agencia,
        },
      });
    } catch (emailError) {
      logger.warn(emailError, {
        context: 'resend-verification-email',
        userId: req.user.id,
      });
      const providerNotConfigured = isEmailProviderNotConfiguredError(emailError);
      return res.status(503).json({
        success: false,
        message: providerNotConfigured
          ? emailProviderMisconfiguredMessage()
          : 'Não foi possível enviar o e-mail no momento. Se o problema continuar, verifique com o suporte ou tente mais tarde.',
        code: providerNotConfigured ? 'EMAIL_PROVIDER_NOT_CONFIGURED' : 'EMAIL_SEND_FAILED',
      });
    }

    logger.banking('verification_email_resent', req.user.id, { email: req.user.email });

    return res.json({
      success: true,
      message:
        'Enviamos um novo e-mail de verificação para o endereço cadastrado. Confira também a pasta de spam.',
    });
  } catch (error) {
    logger.error('Erro em resend-verification-email:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR',
    });
  }
});

router.post('/verify-email', async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Token de verificação é obrigatório',
        code: 'TOKEN_REQUIRED'
      });
    }

    // Buscar usuário pelo token
    const user = await prisma.user.findFirst({
      where: {
        tokenVerificacao: token,
        isVerificado: false
      }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Token de verificação inválido ou expirado',
        code: 'INVALID_TOKEN'
      });
    }

    // Ativar conta
    const verifiedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        isVerificado: true,
        dataVerificacao: new Date(),
        tokenVerificacao: null
      }
    });

    try {
      await qualifyReferralForVerifiedUser(verifiedUser.id);
    } catch (referralError) {
      logger.warn(referralError, {
        context: 'verify-email-qualify-referral',
        userId: verifiedUser.id,
      });
    }

    logger.banking('email_verified', user.id);

    res.json({
      success: true,
      message: 'Email verificado com sucesso'
    });

  } catch (error) {
    logger.error('Erro na verificação de email:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

module.exports = router;
