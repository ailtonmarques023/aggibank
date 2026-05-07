/**
 * Envia os 4 templates oficiais para um endereço de teste.
 * Uso:
 *   node src/scripts/sendEmailTemplatesSample.js seu@email.com
 *   TEST_EMAIL_TO=seu@email.com node src/scripts/sendEmailTemplatesSample.js
 *
 * Requer .env com RESEND_API_KEY + EMAIL_FROM (ou SMTP_HOST, SMTP_USER, SMTP_PASS) e opcionalmente FRONTEND_URL.
 */
require('dotenv').config();

const crypto = require('crypto');
const { sendEmail } = require('../utils/email');

const to = process.argv[2] || process.env.TEST_EMAIL_TO;

async function main() {
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    console.error('Informe um e-mail válido: node src/scripts/sendEmailTemplatesSample.js seu@email.com');
    process.exit(1);
  }

  const tokenWelcome = crypto.randomBytes(16).toString('hex');
  const tokenReset = crypto.randomBytes(16).toString('hex');
  /** Nome com sobrenome: templates usam só o primeiro nome no cumprimento. */
  const nome = 'Maria Silva — Cliente Teste';

  const jobs = [
    {
      label: 'welcome',
      payload: {
        to,
        subject: 'Bem-vindo ao AgilBank - Verifique sua conta',
        template: 'welcome',
        data: {
          nome,
          token: tokenWelcome,
          agencia: '0001',
          numeroConta: '12345-6',
        },
      },
    },
    {
      label: 'passwordReset',
      payload: {
        to,
        template: 'passwordReset',
        data: {
          nome,
          token: tokenReset,
        },
      },
    },
    {
      label: 'transactionNotification',
      payload: {
        to,
        template: 'transactionNotification',
        data: {
          nome,
          tipo: 'PIX enviado',
          valor: '150,75',
          descricao: 'Pagamento teste',
          dataTransacao: new Date(),
          status: 'processada',
          remetente: nome,
          destinatario: 'email.destino@exemplo.com',
        },
      },
    },
    {
      label: 'cardNotification',
      payload: {
        to,
        template: 'cardNotification',
        data: {
          nome,
          status: 'aprovado',
          tipo: 'crédito',
          bandeira: 'Visa',
          limite: 5000,
          dataAprovacao: new Date(),
        },
      },
    },
  ];

  for (const { label, payload } of jobs) {
    process.stdout.write(`Enviando ${label}... `);
    try {
      await sendEmail(payload);
      console.log('OK');
    } catch (e) {
      console.log('FALHOU:', e.message || e);
      process.exitCode = 1;
    }
  }

  if (process.exitCode === 1) {
    console.error('\nVerifique RESEND_API_KEY + EMAIL_FROM ou SMTP no .env (e em produção ALLOW_EMAIL_SMTP_FALLBACK se usar Nodemailer).');
  } else {
    console.log(`\nConcluído. Confira a caixa de entrada (e spam) de ${to}`);
  }
}

main();
