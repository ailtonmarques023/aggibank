const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { sendEmail, testEmailConfiguration } = require('../utils/email');
const logger = require('../utils/logger');

const router = express.Router();

// Aplicar autenticação em todas as rotas
router.use(authenticateToken);

/**
 * @swagger
 * /api/email/test:
 *   post:
 *     summary: Testar configuração de email
 *     tags: [Email]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Teste de email realizado com sucesso
 */
router.post('/test', async (req, res) => {
  try {
    const isConfigured = await testEmailConfiguration();
    
    if (!isConfigured) {
      return res.status(500).json({
        success: false,
        message: 'Configuração de email não está funcionando',
        code: 'EMAIL_CONFIG_ERROR'
      });
    }

    // Enviar email de teste
    await sendEmail({
      to: req.user.email,
      subject: 'Teste de Email - AgilBank',
      html: `
        <h2>Teste de Email</h2>
        <p>Olá ${req.user.nomeCompleto},</p>
        <p>Este é um email de teste para verificar se a configuração de email está funcionando corretamente.</p>
        <p>Se você recebeu este email, a configuração está funcionando!</p>
        <p>Data/Hora: ${new Date().toLocaleString('pt-BR')}</p>
      `
    });

    res.json({
      success: true,
      message: 'Email de teste enviado com sucesso'
    });

  } catch (error) {
    logger.error('Erro ao testar email:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao enviar email de teste',
      code: 'EMAIL_SEND_ERROR'
    });
  }
});

/**
 * @swagger
 * /api/email/send:
 *   post:
 *     summary: Enviar email personalizado
 *     tags: [Email]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - to
 *               - subject
 *               - message
 *             properties:
 *               to:
 *                 type: string
 *                 format: email
 *               subject:
 *                 type: string
 *               message:
 *                 type: string
 *     responses:
 *       200:
 *         description: Email enviado com sucesso
 */
router.post('/send', async (req, res) => {
  try {
    const { to, subject, message } = req.body;

    if (!to || !subject || !message) {
      return res.status(400).json({
        success: false,
        message: 'Destinatário, assunto e mensagem são obrigatórios',
        code: 'MISSING_PARAMETERS'
      });
    }

    // Validar formato do email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) {
      return res.status(400).json({
        success: false,
        message: 'Email inválido',
        code: 'INVALID_EMAIL'
      });
    }

    await sendEmail({
      to,
      subject,
      html: `
        <h2>${subject}</h2>
        <p>${message}</p>
        <hr>
        <p><small>Enviado via AgilBank em ${new Date().toLocaleString('pt-BR')}</small></p>
      `
    });

    logger.info('Email personalizado enviado:', {
      from: req.user.email,
      to,
      subject
    });

    res.json({
      success: true,
      message: 'Email enviado com sucesso'
    });

  } catch (error) {
    logger.error('Erro ao enviar email personalizado:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao enviar email',
      code: 'EMAIL_SEND_ERROR'
    });
  }
});

/**
 * @swagger
 * /api/email/templates:
 *   get:
 *     summary: Listar templates de email disponíveis
 *     tags: [Email]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Templates listados com sucesso
 */
router.get('/templates', (req, res) => {
  try {
    const templates = [
      {
        name: 'welcome',
        description: 'Email de boas-vindas para novos usuários',
        requiredFields: ['nome', 'token', 'numeroConta', 'agencia']
      },
      {
        name: 'passwordReset',
        description: 'Email para redefinição de senha',
        requiredFields: ['nome', 'token']
      },
      {
        name: 'transactionNotification',
        description: 'Notificação de transação PIX',
        requiredFields: ['nome', 'tipo', 'valor', 'descricao', 'dataTransacao', 'status']
      },
      {
        name: 'cardNotification',
        description: 'Notificação de cartão',
        requiredFields: ['nome', 'status', 'tipo', 'bandeira', 'limite', 'dataAprovacao']
      }
    ];

    res.json({
      success: true,
      message: 'Templates listados com sucesso',
      data: { templates }
    });

  } catch (error) {
    logger.error('Erro ao listar templates:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * @swagger
 * /api/email/send-template:
 *   post:
 *     summary: Enviar email usando template
 *     tags: [Email]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - to
 *               - template
 *               - data
 *             properties:
 *               to:
 *                 type: string
 *                 format: email
 *               template:
 *                 type: string
 *                 enum: [welcome, passwordReset, transactionNotification, cardNotification]
 *               data:
 *                 type: object
 *     responses:
 *       200:
 *         description: Email enviado com sucesso
 */
router.post('/send-template', async (req, res) => {
  try {
    const { to, template, data } = req.body;

    if (!to || !template || !data) {
      return res.status(400).json({
        success: false,
        message: 'Destinatário, template e dados são obrigatórios',
        code: 'MISSING_PARAMETERS'
      });
    }

    // Validar formato do email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) {
      return res.status(400).json({
        success: false,
        message: 'Email inválido',
        code: 'INVALID_EMAIL'
      });
    }

    // Validar template
    const validTemplates = ['welcome', 'passwordReset', 'transactionNotification', 'cardNotification'];
    if (!validTemplates.includes(template)) {
      return res.status(400).json({
        success: false,
        message: 'Template inválido',
        code: 'INVALID_TEMPLATE'
      });
    }

    await sendEmail({
      to,
      template,
      data
    });

    logger.info('Email com template enviado:', {
      from: req.user.email,
      to,
      template
    });

    res.json({
      success: true,
      message: 'Email enviado com sucesso'
    });

  } catch (error) {
    logger.error('Erro ao enviar email com template:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao enviar email',
      code: 'EMAIL_SEND_ERROR'
    });
  }
});

module.exports = router;
