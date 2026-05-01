const nodemailer = require('nodemailer');
const logger = require('./logger');

// Configuração do transporter de email
const createTransporter = () => {
  return nodemailer.createTransporter({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: false, // true para 465, false para outras portas
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    tls: {
      rejectUnauthorized: false
    }
  });
};

// Templates de email
const emailTemplates = {
  welcome: (data) => ({
    subject: 'Bem-vindo ao AgilBank!',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Bem-vindo ao AgilBank</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .account-info { background: white; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #667eea; }
          .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🏦 AgilBank</h1>
            <h2>Bem-vindo, ${data.nome}!</h2>
          </div>
          <div class="content">
            <p>Olá <strong>${data.nome}</strong>,</p>
            <p>Seja bem-vindo ao AgilBank! Sua conta foi criada com sucesso.</p>
            
            <div class="account-info">
              <h3>📋 Informações da sua conta:</h3>
              <p><strong>Agência:</strong> ${data.agencia}</p>
              <p><strong>Conta:</strong> ${data.numeroConta}</p>
            </div>
            
            <p>Para ativar sua conta e começar a usar todos os serviços do AgilBank, clique no botão abaixo:</p>
            
            <a href="${process.env.FRONTEND_URL}/verify-email?token=${data.token}" class="button">
              ✅ Verificar Email
            </a>
            
            <p>Ou copie e cole este link no seu navegador:</p>
            <p style="word-break: break-all; background: #eee; padding: 10px; border-radius: 5px;">
              ${process.env.FRONTEND_URL}/verify-email?token=${data.token}
            </p>
            
            <p><strong>Importante:</strong> Este link expira em 24 horas por motivos de segurança.</p>
            
            <p>Se você não criou uma conta no AgilBank, ignore este email.</p>
          </div>
          <div class="footer">
            <p>AgilBank - Seu banco digital de confiança</p>
            <p>Este é um email automático, não responda.</p>
          </div>
        </div>
      </body>
      </html>
    `
  }),

  passwordReset: (data) => ({
    subject: 'Redefinir senha - AgilBank',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Redefinir Senha - AgilBank</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .button { display: inline-block; background: #e74c3c; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .warning { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🏦 AgilBank</h1>
            <h2>Redefinir Senha</h2>
          </div>
          <div class="content">
            <p>Olá <strong>${data.nome}</strong>,</p>
            <p>Recebemos uma solicitação para redefinir a senha da sua conta AgilBank.</p>
            
            <div class="warning">
              <p><strong>⚠️ Importante:</strong> Se você não solicitou a redefinição de senha, ignore este email.</p>
            </div>
            
            <p>Para redefinir sua senha, clique no botão abaixo:</p>
            
            <a href="${process.env.FRONTEND_URL}/reset-password?token=${data.token}" class="button">
              🔐 Redefinir Senha
            </a>
            
            <p>Ou copie e cole este link no seu navegador:</p>
            <p style="word-break: break-all; background: #eee; padding: 10px; border-radius: 5px;">
              ${process.env.FRONTEND_URL}/reset-password?token=${data.token}
            </p>
            
            <p><strong>Este link expira em 1 hora por motivos de segurança.</strong></p>
          </div>
          <div class="footer">
            <p>AgilBank - Seu banco digital de confiança</p>
            <p>Este é um email automático, não responda.</p>
          </div>
        </div>
      </body>
      </html>
    `
  }),

  transactionNotification: (data) => ({
    subject: `Transação ${data.tipo} - AgilBank`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Notificação de Transação - AgilBank</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .transaction-info { background: white; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #667eea; }
          .amount { font-size: 24px; font-weight: bold; color: ${data.tipo === 'recebimento' ? '#27ae60' : '#e74c3c'}; }
          .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🏦 AgilBank</h1>
            <h2>Notificação de Transação</h2>
          </div>
          <div class="content">
            <p>Olá <strong>${data.nome}</strong>,</p>
            <p>Uma transação foi realizada na sua conta:</p>
            
            <div class="transaction-info">
              <h3>📊 Detalhes da Transação:</h3>
              <p><strong>Tipo:</strong> ${data.tipo === 'recebimento' ? 'Recebimento' : 'Envio'} PIX</p>
              <p><strong>Valor:</strong> <span class="amount">R$ ${data.valor}</span></p>
              <p><strong>Descrição:</strong> ${data.descricao || 'Sem descrição'}</p>
              <p><strong>Data:</strong> ${new Date(data.dataTransacao).toLocaleString('pt-BR')}</p>
              <p><strong>Status:</strong> ${data.status}</p>
            </div>
            
            <p>Se você não reconhece esta transação, entre em contato conosco imediatamente.</p>
          </div>
          <div class="footer">
            <p>AgilBank - Seu banco digital de confiança</p>
            <p>Este é um email automático, não responda.</p>
          </div>
        </div>
      </body>
      </html>
    `
  }),

  cardNotification: (data) => ({
    subject: `Cartão ${data.status} - AgilBank`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Notificação de Cartão - AgilBank</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .card-info { background: white; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #667eea; }
          .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🏦 AgilBank</h1>
            <h2>Notificação de Cartão</h2>
          </div>
          <div class="content">
            <p>Olá <strong>${data.nome}</strong>,</p>
            <p>Seu cartão foi <strong>${data.status}</strong> com sucesso!</p>
            
            <div class="card-info">
              <h3>💳 Informações do Cartão:</h3>
              <p><strong>Tipo:</strong> ${data.tipo}</p>
              <p><strong>Bandeira:</strong> ${data.bandeira}</p>
              <p><strong>Limite:</strong> R$ ${data.limite}</p>
              <p><strong>Data de Aprovação:</strong> ${new Date(data.dataAprovacao).toLocaleString('pt-BR')}</p>
            </div>
            
            <p>Você já pode usar seu cartão para fazer compras e saques.</p>
          </div>
          <div class="footer">
            <p>AgilBank - Seu banco digital de confiança</p>
            <p>Este é um email automático, não responda.</p>
          </div>
        </div>
      </body>
      </html>
    `
  })
};

// Função principal para enviar email
const sendEmail = async ({ to, subject, html, template, data = {} }) => {
  try {
    const transporter = createTransporter();

    let emailContent;
    
    if (template && emailTemplates[template]) {
      emailContent = emailTemplates[template](data);
    } else {
      emailContent = { subject, html };
    }

    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME || 'AgilBank'}" <${process.env.EMAIL_FROM || process.env.SMTP_USER}>`,
      to,
      subject: emailContent.subject,
      html: emailContent.html,
    };

    const result = await transporter.sendMail(mailOptions);
    
    logger.info('Email enviado com sucesso:', {
      to,
      subject: emailContent.subject,
      messageId: result.messageId
    });

    return {
      success: true,
      messageId: result.messageId
    };

  } catch (error) {
    logger.error('Erro ao enviar email:', {
      to,
      subject,
      error: error.message
    });

    throw error;
  }
};

// Função para enviar email de boas-vindas
const sendWelcomeEmail = async (userData) => {
  return await sendEmail({
    to: userData.email,
    template: 'welcome',
    data: userData
  });
};

// Função para enviar email de redefinição de senha
const sendPasswordResetEmail = async (userData) => {
  return await sendEmail({
    to: userData.email,
    template: 'passwordReset',
    data: userData
  });
};

// Função para enviar notificação de transação
const sendTransactionNotification = async (userData, transactionData) => {
  return await sendEmail({
    to: userData.email,
    template: 'transactionNotification',
    data: {
      ...userData,
      ...transactionData
    }
  });
};

// Função para enviar notificação de cartão
const sendCardNotification = async (userData, cardData) => {
  return await sendEmail({
    to: userData.email,
    template: 'cardNotification',
    data: {
      ...userData,
      ...cardData
    }
  });
};

// Função para testar configuração de email
const testEmailConfiguration = async () => {
  try {
    const transporter = createTransporter();
    await transporter.verify();
    logger.info('✅ Configuração de email verificada com sucesso');
    return true;
  } catch (error) {
    logger.error('❌ Erro na configuração de email:', error);
    return false;
  }
};

module.exports = {
  sendEmail,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendTransactionNotification,
  sendCardNotification,
  testEmailConfiguration,
};
