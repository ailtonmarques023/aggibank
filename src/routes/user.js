const express = require('express');
const { authenticateToken, requireVerification } = require('../middleware/auth');
const { validateProfileUpdate, validatePasswordChange, validateAddress } = require('../middleware/validation');
const { prisma } = require('../config/database');
const bcrypt = require('bcryptjs');
const logger = require('../utils/logger');

const router = express.Router();

// Aplicar autenticação em todas as rotas
router.use(authenticateToken);

/**
 * @swagger
 * /api/user/profile:
 *   get:
 *     summary: Obter perfil do usuário
 *     tags: [Usuário]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Perfil obtido com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 */
router.get('/profile', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        nomeCompleto: true,
        email: true,
        cpf: true,
        telefone: true,
        dataNascimento: true,
        saldoAtual: true,
        limiteCartao: true,
        limitePixDiario: true,
        limitePixMensal: true,
        scoreCredito: true,
        numeroConta: true,
        digitoConta: true,
        agencia: true,
        isAtivo: true,
        isVerificado: true,
        createdAt: true,
        updatedAt: true,
        endereco: true,
        dadosProfissionais: true,
        configuracoes: true
      }
    });

    res.json({
      success: true,
      message: 'Perfil obtido com sucesso',
      data: { user }
    });

  } catch (error) {
    logger.error('Erro ao obter perfil:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * @swagger
 * /api/user/profile:
 *   put:
 *     summary: Atualizar perfil do usuário
 *     tags: [Usuário]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nomeCompleto:
 *                 type: string
 *               telefone:
 *                 type: string
 *     responses:
 *       200:
 *         description: Perfil atualizado com sucesso
 */
router.put('/profile', validateProfileUpdate, async (req, res) => {
  try {
    const { nomeCompleto, telefone } = req.body;
    
    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        ...(nomeCompleto && { nomeCompleto }),
        ...(telefone && { telefone }),
      },
      select: {
        id: true,
        nomeCompleto: true,
        email: true,
        telefone: true,
        updatedAt: true
      }
    });

    logger.audit('profile_update', req.user.id, 'user', {
      fields: Object.keys(req.body)
    });

    res.json({
      success: true,
      message: 'Perfil atualizado com sucesso',
      data: { user: updatedUser }
    });

  } catch (error) {
    logger.error('Erro ao atualizar perfil:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * @swagger
 * /api/user/change-password:
 *   post:
 *     summary: Alterar senha
 *     tags: [Usuário]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - senhaAtual
 *               - novaSenha
 *               - confirmarSenha
 *             properties:
 *               senhaAtual:
 *                 type: string
 *               novaSenha:
 *                 type: string
 *               confirmarSenha:
 *                 type: string
 *     responses:
 *       200:
 *         description: Senha alterada com sucesso
 */
router.post('/change-password', validatePasswordChange, async (req, res) => {
  try {
    const { senhaAtual, novaSenha } = req.body;

    // Buscar usuário com senha
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, senha: true }
    });

    // Verificar senha atual
    const senhaValida = await bcrypt.compare(senhaAtual, user.senha);
    if (!senhaValida) {
      return res.status(400).json({
        success: false,
        message: 'Senha atual incorreta',
        code: 'INVALID_CURRENT_PASSWORD'
      });
    }

    // Criptografar nova senha
    const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
    const novaSenhaHash = await bcrypt.hash(novaSenha, saltRounds);

    // Atualizar senha
    await prisma.user.update({
      where: { id: req.user.id },
      data: { senha: novaSenhaHash }
    });

    logger.security('password_changed', {
      userId: req.user.id,
      ip: req.ip
    });

    res.json({
      success: true,
      message: 'Senha alterada com sucesso'
    });

  } catch (error) {
    logger.error('Erro ao alterar senha:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * @swagger
 * /api/user/address:
 *   get:
 *     summary: Obter endereço do usuário
 *     tags: [Usuário]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Endereço obtido com sucesso
 */
router.get('/address', async (req, res) => {
  try {
    const endereco = await prisma.endereco.findUnique({
      where: { userId: req.user.id }
    });

    res.json({
      success: true,
      message: 'Endereço obtido com sucesso',
      data: { endereco }
    });

  } catch (error) {
    logger.error('Erro ao obter endereço:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * @swagger
 * /api/user/address:
 *   post:
 *     summary: Cadastrar/atualizar endereço
 *     tags: [Usuário]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - cep
 *               - logradouro
 *               - numero
 *               - bairro
 *               - cidade
 *               - estado
 *             properties:
 *               cep:
 *                 type: string
 *               logradouro:
 *                 type: string
 *               numero:
 *                 type: string
 *               complemento:
 *                 type: string
 *               bairro:
 *                 type: string
 *               cidade:
 *                 type: string
 *               estado:
 *                 type: string
 *     responses:
 *       200:
 *         description: Endereço salvo com sucesso
 */
router.post('/address', validateAddress, async (req, res) => {
  try {
    const { cep, logradouro, numero, complemento, bairro, cidade, estado } = req.body;

    const endereco = await prisma.endereco.upsert({
      where: { userId: req.user.id },
      update: {
        cep,
        logradouro,
        numero,
        complemento,
        bairro,
        cidade,
        estado
      },
      create: {
        userId: req.user.id,
        cep,
        logradouro,
        numero,
        complemento,
        bairro,
        cidade,
        estado
      }
    });

    logger.audit('address_update', req.user.id, 'address');

    res.json({
      success: true,
      message: 'Endereço salvo com sucesso',
      data: { endereco }
    });

  } catch (error) {
    logger.error('Erro ao salvar endereço:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * @swagger
 * /api/user/balance:
 *   get:
 *     summary: Obter saldo da conta
 *     tags: [Usuário]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Saldo obtido com sucesso
 */
router.get('/balance', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        saldoAtual: true,
        limiteCartao: true,
        limitePixDiario: true,
        limitePixMensal: true
      }
    });

    res.json({
      success: true,
      message: 'Saldo obtido com sucesso',
      data: {
        saldoAtual: user.saldoAtual,
        limiteCartao: user.limiteCartao,
        limitePixDiario: user.limitePixDiario,
        limitePixMensal: user.limitePixMensal
      }
    });

  } catch (error) {
    logger.error('Erro ao obter saldo:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * @swagger
 * /api/user/settings:
 *   get:
 *     summary: Obter configurações do usuário
 *     tags: [Usuário]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Configurações obtidas com sucesso
 */
router.get('/settings', async (req, res) => {
  try {
    const configuracoes = await prisma.configuracoesUsuario.findUnique({
      where: { userId: req.user.id }
    });

    res.json({
      success: true,
      message: 'Configurações obtidas com sucesso',
      data: { configuracoes }
    });

  } catch (error) {
    logger.error('Erro ao obter configurações:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * @swagger
 * /api/user/settings:
 *   put:
 *     summary: Atualizar configurações do usuário
 *     tags: [Usuário]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               notificacoesEmail:
 *                 type: boolean
 *               notificacoesSms:
 *                 type: boolean
 *               notificacoesPush:
 *                 type: boolean
 *               temaInterface:
 *                 type: string
 *               idioma:
 *                 type: string
 *     responses:
 *       200:
 *         description: Configurações atualizadas com sucesso
 */
router.put('/settings', async (req, res) => {
  try {
    const { notificacoesEmail, notificacoesSms, notificacoesPush, temaInterface, idioma } = req.body;

    const configuracoes = await prisma.configuracoesUsuario.update({
      where: { userId: req.user.id },
      data: {
        ...(notificacoesEmail !== undefined && { notificacoesEmail }),
        ...(notificacoesSms !== undefined && { notificacoesSms }),
        ...(notificacoesPush !== undefined && { notificacoesPush }),
        ...(temaInterface && { temaInterface }),
        ...(idioma && { idioma })
      }
    });

    logger.audit('settings_update', req.user.id, 'configuracoes');

    res.json({
      success: true,
      message: 'Configurações atualizadas com sucesso',
      data: { configuracoes }
    });

  } catch (error) {
    logger.error('Erro ao atualizar configurações:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

router.get('/user-complete-data', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: {
        endereco: true,
        dadosProfissionais: true,
        configuracoes: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuário não encontrado',
        code: 'USER_NOT_FOUND',
      });
    }

    const toNumber = (value) => value == null ? 0 : Number(value);
    const usuario = {
      id: user.id,
      nome_completo: user.nomeCompleto,
      nomeCompleto: user.nomeCompleto,
      email: user.email,
      cpf: user.cpf,
      telefone: user.telefone,
      data_nascimento: user.dataNascimento,
      saldo_atual: toNumber(user.saldoAtual),
      saldoAtual: toNumber(user.saldoAtual),
      limite_cartao: toNumber(user.limiteCartao) || 4300,
      limiteCartao: toNumber(user.limiteCartao) || 4300,
      limite_pix_diario: toNumber(user.limitePixDiario),
      limite_pix_mensal: toNumber(user.limitePixMensal),
      score_credito: user.scoreCredito,
      numero_conta: user.numeroConta,
      digito_conta: user.digitoConta,
      agencia: user.agencia,
      is_ativo: user.isAtivo,
      is_verificado: user.isVerificado,
      endereco: user.endereco,
      dados_profissionais: user.dadosProfissionais,
      configuracoes: user.configuracoes,
    };

    res.json({
      success: true,
      message: 'Dados completos obtidos com sucesso',
      user_data: { usuario },
      data: { user: usuario, user_data: { usuario } },
    });
  } catch (error) {
    logger.error('Erro ao obter dados completos do usuário:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR',
    });
  }
});

module.exports = router;
