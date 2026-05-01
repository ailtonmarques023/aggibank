const express = require('express');
const bcrypt = require('bcryptjs');
const { prisma } = require('../config/database');
const {
  generateToken,
  generateRefreshToken,
  verifyRefreshToken,
  hashRefreshToken,
  authenticateToken,
} = require('../middleware/auth');
const { validateUserRegistration, validateLogin } = require('../middleware/validation');
const logger = require('../utils/logger');
const { sendEmail } = require('../utils/email');
const { recordAudit } = require('../utils/auditLog');

const router = express.Router();
const CPF_LOGIN_REGEX = /^\d{11}$/;

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
    const { nomeCompleto, email, cpf, telefone, dataNascimento, senha, endereco, dadosProfissionais } = req.body;

    // Criptografar senha
    const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
    const senhaHash = await bcrypt.hash(senha, saltRounds);

    // Gerar número de conta único
    const numeroConta = Math.floor(100000 + Math.random() * 900000).toString();
    const digitoConta = Math.floor(10 + Math.random() * 90).toString();
    const agencia = '0001';

    // Gerar token de verificação
    const tokenVerificacao = require('crypto').randomBytes(32).toString('hex');

    // Criar usuário
    const user = await prisma.user.create({
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
        // Criar endereço se fornecido
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
        // Criar dados profissionais se fornecidos
        dadosProfissionais: dadosProfissionais ? {
          create: {
            profissao: dadosProfissionais.profissao,
            empresa: dadosProfissionais.empresa || '',
            cargo: dadosProfissionais.cargo || '',
            rendaMensal: dadosProfissionais.rendaMensal ? parseFloat(dadosProfissionais.rendaMensal) : null,
            tempoTrabalho: dadosProfissionais.tempoTrabalho || ''
          }
        } : undefined
      },
      include: {
        endereco: true,
        dadosProfissionais: true
      }
    });

    // Criar configurações padrão do usuário
    await prisma.configuracoesUsuario.create({
      data: {
        userId: user.id,
        notificacoesEmail: true,
        notificacoesSms: true,
        notificacoesPush: true,
        temaInterface: 'claro',
        idioma: 'pt-BR',
      }
    });

    // Enviar email de verificação
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
        }
      });
    } catch (emailError) {
      logger.warn('Erro ao enviar email de verificação:', emailError);
    }

    // Log da operação
    logger.banking('user_registration', user.id, {
      email,
      numeroConta: `${numeroConta}-${digitoConta}`,
    });

    res.status(201).json({
      success: true,
      message: 'Usuário registrado com sucesso. Verifique seu email para ativar a conta.',
      data: {
        user,
        message: 'Verifique seu email para ativar sua conta'
      }
    });

  } catch (error) {
    logger.error('Erro no registro:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
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

    // Buscar usuário
    const user = await prisma.user.findUnique({
      where: { [loginIdentifier.type]: loginIdentifier.value },
      include: {
        configuracoes: true
      }
    });

    if (!user) {
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
      logger.security('login_failed', { identifierType: loginIdentifier.type, reason: 'invalid_password' });
      return res.status(401).json({
        success: false,
        message: 'Senha incorreta. Confira os 6 dígitos.',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // Verificar se conta está ativa
    if (!user.isAtivo) {
      logger.security('login_failed', { userId: user.id, reason: 'account_inactive' });
      return res.status(401).json({
        success: false,
        message: 'Conta desativada',
        code: 'ACCOUNT_DEACTIVATED'
      });
    }

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
    await prisma.user.update({
      where: { id: user.id },
      data: {
        isVerificado: true,
        dataVerificacao: new Date(),
        tokenVerificacao: null
      }
    });

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
