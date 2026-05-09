const axios = require('axios');
const nodemailer = require('nodemailer');
const logger = require('./logger');

const RESEND_API_URL = 'https://api.resend.com/emails';

/**
 * Base URL do front onde ficam confirmar-email.html e reset-password.html (pasta /banco).
 * Evita duplicar /banco se FRONTEND_URL já terminar com /banco.
 */
function frontendBancoPagesBase() {
  const raw = String(process.env.FRONTEND_URL || '').trim().replace(/\/+$/, '');
  if (!raw) return '/banco';
  const lower = raw.toLowerCase();
  if (lower.endsWith('/banco')) return raw;
  return `${raw}/banco`;
}

function confirmarEmailPageUrl(token) {
  const base = frontendBancoPagesBase();
  return `${base}/confirmar-email.html?token=${encodeURIComponent(token)}`;
}

function resetPasswordPageUrl(token) {
  const base = frontendBancoPagesBase();
  return `${base}/reset-password.html?token=${encodeURIComponent(token)}`;
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

/** Primeira palavra do nome completo para cumprimentos (ex.: "Maria Silva" → "Maria"). */
function primeiroNomeFromCompleto(nomeCompleto) {
  const s = String(nomeCompleto ?? '').trim();
  if (!s) return 'Cliente';
  const part = s.split(/\s+/)[0];
  return part || 'Cliente';
}

/** Mascara chave PIX / destino para o corpo do e-mail (não exibe chave completa). */
function maskPixKeyForDisplay(key) {
  const k = String(key || '').trim();
  if (!k) return '—';
  if (k.includes('@')) {
    const at = k.indexOf('@');
    const local = k.slice(0, at);
    const domain = k.slice(at + 1);
    if (!domain) return '***';
    const loc = local.length <= 2 ? '**' : `${local.slice(0, 2)}***`;
    return `${loc}@${domain}`;
  }
  const digits = k.replace(/\D/g, '');
  if (digits.length >= 11) {
    return `***${digits.slice(-4)}`;
  }
  if (k.length <= 6) return '***';
  return `${k.slice(0, 3)}***${k.slice(-3)}`;
}

function formatMoneyBR(raw) {
  if (raw == null || raw === '') return '—';
  try {
    let n;
    if (typeof raw === 'object' && raw !== null && typeof raw.toNumber === 'function') {
      n = raw.toNumber();
    } else {
      n = parseFloat(String(raw).replace(',', '.'));
    }
    if (Number.isNaN(n)) return escapeHtml(String(raw));
    return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  } catch {
    return escapeHtml(String(raw));
  }
}

function formatTransactionDate(raw) {
  if (raw == null) return '—';
  try {
    const d = raw instanceof Date ? raw : new Date(raw);
    if (Number.isNaN(d.getTime())) return escapeHtml(String(raw));
    return escapeHtml(d.toLocaleString('pt-BR'));
  } catch {
    return '—';
  }
}

function humanizeStatus(status) {
  if (status == null || status === '') return '—';
  const s = String(status);
  return escapeHtml(s.charAt(0).toUpperCase() + s.slice(1));
}

function securityFooterHtml() {
  return `
    <tr>
      <td style="padding:20px 28px 28px 28px;background:#f0f4f8;border-top:1px solid #d8e0e8;">
        <p style="margin:0 0 10px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#5a6b7a;">
          <strong style="color:#003355;">Segurança:</strong> o AgilBank nunca pede senha, token ou código por e-mail.
          Não compartilhe dados da sua conta. Se desconfiar de fraude, acione o app ou canais oficiais.
        </p>
        <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.5;color:#7a8a96;">
          Mensagem automática — não responda. Em dúvida, entre em contato pelo suporte oficial.
        </p>
      </td>
    </tr>
  `;
}

function securityFooterText() {
  return [
    '',
    '---',
    'Segurança: o AgilBank nunca pede senha, token ou código por e-mail. Não compartilhe dados da sua conta.',
    'Mensagem automática — não responda.',
  ].join('\n');
}

/**
 * Layout HTML responsivo (largura máx. 600px, fundo institucional).
 */
function wrapEmailDocument({ preheader, innerRowsHtml }) {
  const pre = escapeHtml(preheader || '');
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="x-apple-disable-message-reformatting">
  <title>AgilBank</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
</head>
<body style="margin:0;padding:0;background:#e8eef3;-webkit-text-size-adjust:100%;">
  <span style="display:none!important;visibility:hidden;opacity:0;height:0;width:0;color:transparent;">${pre}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#e8eef3;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,51,85,0.08);">
          <tr>
            <td style="padding:28px 28px 20px 28px;background:linear-gradient(135deg,#003355 0%,#004c7a 55%,#0066a1 100%);">
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:13px;letter-spacing:0.12em;text-transform:uppercase;color:#8ecff5;">
                AgilBank
              </p>
              <p style="margin:8px 0 0 0;font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:1.25;color:#ffffff;">
                Banco digital
              </p>
            </td>
          </tr>
          ${innerRowsHtml}
          ${securityFooterHtml()}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function ctaRow(ctaHref, ctaLabel) {
  const href = escapeHtml(ctaHref);
  const label = escapeHtml(ctaLabel);
  return `
    <tr>
      <td style="padding:8px 28px 28px 28px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="left">
          <tr>
            <td style="border-radius:8px;background:#00a3e0;">
              <a href="${href}" target="_blank" rel="noopener noreferrer"
                style="display:inline-block;padding:14px 28px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:8px;">
                ${label}
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `;
}

// API oficial do Nodemailer é `createTransport` (não existe `createTransporter`).
const buildSmtpTransport = () => {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT, 10) || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    tls: {
      rejectUnauthorized: false,
    },
  });
};

const emailTemplates = {
  welcome: (data) => {
    const primeiro = primeiroNomeFromCompleto(data.nome);
    const primeiroEsc = escapeHtml(primeiro);
    const verifyUrl = confirmarEmailPageUrl(data.token);
    const ag = data.agencia != null && String(data.agencia).trim() !== '';
    const nc = data.numeroConta != null && String(data.numeroConta).trim() !== '';
    const accountBlock =
      ag && nc
        ? `
    <tr>
      <td style="padding:0 28px 8px 28px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f8fb;border-radius:8px;border-left:4px solid #00a3e0;">
          <tr>
            <td style="padding:16px 18px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1a2b3c;">
              <strong style="color:#003355;">Dados da conta</strong><br>
              <span style="color:#5a6b7a;">Agência:</span> ${escapeHtml(String(data.agencia))}<br>
              <span style="color:#5a6b7a;">Conta:</span> ${escapeHtml(String(data.numeroConta))}
            </td>
          </tr>
        </table>
      </td>
    </tr>`
        : '';

    const inner = `
    <tr>
      <td style="padding:24px 28px 8px 28px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.55;color:#1a2b3c;">
        <p style="margin:0 0 12px 0;font-size:18px;color:#003355;"><strong>Parabéns, ${primeiroEsc}!</strong></p>
        <p style="margin:0 0 12px 0;">Você já é <strong>cliente AgilBank</strong>. Sua conta foi aberta e estamos felizes em ter você com a gente.</p>
        <p style="margin:0 0 12px 0;">Para liberar o acesso completo ao app e ao internet banking, confirme seu e-mail clicando no botão abaixo — é rápido e garante a segurança da sua conta.</p>
        <p style="margin:0;font-size:14px;color:#5a6b7a;">Se você não solicitou esta abertura de conta, ignore esta mensagem.</p>
      </td>
    </tr>
    ${accountBlock}
    ${ctaRow(verifyUrl, 'Verificar meu e-mail')}
    <tr>
      <td style="padding:0 28px 24px 28px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;color:#5a6b7a;">
        <p style="margin:0 0 8px 0;">Se o botão não funcionar, copie o link:</p>
        <p style="margin:0;word-break:break-all;background:#f0f4f8;padding:10px 12px;border-radius:6px;font-size:12px;color:#003355;">${escapeHtml(verifyUrl)}</p>
      </td>
    </tr>`;

    const text = [
      `Parabéns, ${primeiro}!`,
      '',
      'Você já é cliente AgilBank. Sua conta foi aberta.',
      '',
      'Para liberar o acesso completo, confirme seu e-mail acessando:',
      verifyUrl,
      '',
      ag && nc ? `Agência: ${data.agencia} | Conta: ${data.numeroConta}` : '',
      '',
      'Se você não abriu esta conta, ignore esta mensagem.',
      securityFooterText(),
    ]
      .filter(Boolean)
      .join('\n');

    return {
      subject: 'Bem-vindo ao AgilBank - Verifique sua conta',
      html: wrapEmailDocument({
        preheader: `Parabéns — você já é cliente AgilBank, ${primeiro}`,
        innerRowsHtml: inner,
      }),
      text,
    };
  },

  passwordReset: (data) => {
    const nome = escapeHtml(primeiroNomeFromCompleto(data.nome));
    const resetUrl = resetPasswordPageUrl(data.token);
    const inner = `
    <tr>
      <td style="padding:24px 28px 8px 28px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.55;color:#1a2b3c;">
        <p style="margin:0 0 12px 0;">Olá, <strong>${nome}</strong>,</p>
        <p style="margin:0 0 12px 0;">Recebemos um pedido para <strong>redefinir a senha</strong> da sua conta AgilBank.</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fff8e6;border-radius:8px;border:1px solid #f5e0a8;">
          <tr>
            <td style="padding:14px 16px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#5c4a00;">
              <strong>Importante:</strong> se você <em>não</em> solicitou esta alteração, ignore este e-mail. Sua senha permanece a mesma.
            </td>
          </tr>
        </table>
        <p style="margin:16px 0 0 0;font-size:14px;color:#5a6b7a;">O link abaixo expira em <strong>1 hora</strong>.</p>
      </td>
    </tr>
    ${ctaRow(resetUrl, 'Redefinir senha')}
    <tr>
      <td style="padding:0 28px 24px 28px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;color:#5a6b7a;">
        <p style="margin:0 0 8px 0;">Link alternativo:</p>
        <p style="margin:0;word-break:break-all;background:#f0f4f8;padding:10px 12px;border-radius:6px;font-size:12px;color:#003355;">${escapeHtml(resetUrl)}</p>
      </td>
    </tr>`;

    const text = [
      `Olá, ${primeiroNomeFromCompleto(data.nome)},`,
      '',
      'Para redefinir sua senha no AgilBank, acesse (válido por 1 hora):',
      resetUrl,
      '',
      'Se você não solicitou, ignore este e-mail.',
      securityFooterText(),
    ].join('\n');

    return {
      subject: 'Redefinir senha - AgilBank',
      html: wrapEmailDocument({
        preheader: 'Redefinição de senha AgilBank — link válido por 1 hora',
        innerRowsHtml: inner,
      }),
      text,
    };
  },

  transactionNotification: (data) => {
    const primeiroEsc = escapeHtml(primeiroNomeFromCompleto(data.nome));
    const nomeCompletoEsc = escapeHtml(data.nome || 'Cliente');
    const tipoPlain = data.tipo != null && String(data.tipo).trim() !== '' ? String(data.tipo).trim() : 'Transação';
    const tipoLabel = escapeHtml(tipoPlain);
    const valorFmt = formatMoneyBR(data.valor);
    const desc = data.descricao != null && String(data.descricao).trim() !== '' ? escapeHtml(data.descricao) : '—';
    const maskedDest = escapeHtml(maskPixKeyForDisplay(data.destinatario));
    const remetente =
      data.remetente != null && String(data.remetente).trim() !== ''
        ? escapeHtml(data.remetente)
        : nomeCompletoEsc;
    const isCredit = tipoPlain.toLowerCase().includes('receb');
    const amountColor = isCredit ? '#0d7a4f' : '#c0392b';

    const inner = `
    <tr>
      <td style="padding:24px 28px 8px 28px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.55;color:#1a2b3c;">
        <p style="margin:0 0 12px 0;">Olá, <strong>${primeiroEsc}</strong>,</p>
        <p style="margin:0 0 12px 0;">Registramos uma movimentação na sua conta:</p>
      </td>
    </tr>
    <tr>
      <td style="padding:0 28px 20px 28px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f8fb;border-radius:8px;border-left:4px solid #00a3e0;">
          <tr>
            <td style="padding:18px 20px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1a2b3c;">
              <p style="margin:0 0 8px 0;"><span style="color:#5a6b7a;">Tipo:</span> <strong>${tipoLabel}</strong></p>
              <p style="margin:0 0 8px 0;"><span style="color:#5a6b7a;">Valor:</span>
                <strong style="font-size:20px;color:${amountColor};">R$ ${valorFmt}</strong></p>
              <p style="margin:0 0 8px 0;"><span style="color:#5a6b7a;">Data:</span> ${formatTransactionDate(data.dataTransacao)}</p>
              <p style="margin:0 0 8px 0;"><span style="color:#5a6b7a;">Status:</span> ${humanizeStatus(data.status)}</p>
              <p style="margin:0 0 8px 0;"><span style="color:#5a6b7a;">Descrição:</span> ${desc}</p>
              <p style="margin:0 0 8px 0;"><span style="color:#5a6b7a;">Remetente (conta):</span> ${remetente}</p>
              <p style="margin:0;"><span style="color:#5a6b7a;">Destino (chave mascarada):</span> ${maskedDest}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:0 28px 24px 28px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#5a6b7a;">
        Se você não reconhece esta operação, entre em contato com o suporte imediatamente.
      </td>
    </tr>`;

    const text = [
      `Olá, ${primeiroNomeFromCompleto(data.nome)},`,
      '',
      `Tipo: ${tipoPlain}`,
      `Valor: R$ ${formatMoneyBR(data.valor)}`,
      `Data: ${data.dataTransacao ? new Date(data.dataTransacao).toLocaleString('pt-BR') : '—'}`,
      `Status: ${data.status || '—'}`,
      `Descrição: ${data.descricao || '—'}`,
      `Remetente: ${data.remetente || data.nome || '—'}`,
      `Destino (mascarado): ${maskPixKeyForDisplay(data.destinatario)}`,
      '',
      'Se não reconhece esta operação, contate o suporte.',
      securityFooterText(),
    ].join('\n');

    return {
      subject: `Transação ${tipoPlain} - AgilBank`,
      html: wrapEmailDocument({
        preheader: `${tipoPlain} — AgilBank`,
        innerRowsHtml: inner,
      }),
      text,
    };
  },

  cardNotification: (data) => {
    const primeiroEsc = escapeHtml(primeiroNomeFromCompleto(data.nome));
    const statusRaw = data.status != null ? String(data.status) : 'atualizado';
    const statusTitle = statusRaw.charAt(0).toUpperCase() + statusRaw.slice(1);
    const statusLabel = escapeHtml(statusTitle);
    const tipo = escapeHtml(data.tipo || '—');
    const bandeira = escapeHtml(data.bandeira || '—');
    const limite = formatMoneyBR(data.limite);
    const dataApr = formatTransactionDate(data.dataAprovacao);

    const inner = `
    <tr>
      <td style="padding:24px 28px 8px 28px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.55;color:#1a2b3c;">
        <p style="margin:0 0 12px 0;">Olá, <strong>${primeiroEsc}</strong>,</p>
        <p style="margin:0 0 12px 0;">Seu cartão foi <strong>${statusLabel}</strong> no AgilBank.</p>
      </td>
    </tr>
    <tr>
      <td style="padding:0 28px 20px 28px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f8fb;border-radius:8px;border-left:4px solid #00a3e0;">
          <tr>
            <td style="padding:18px 20px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1a2b3c;">
              <p style="margin:0 0 8px 0;"><span style="color:#5a6b7a;">Status:</span> <strong>${statusLabel}</strong></p>
              <p style="margin:0 0 8px 0;"><span style="color:#5a6b7a;">Modalidade:</span> ${tipo}</p>
              <p style="margin:0 0 8px 0;"><span style="color:#5a6b7a;">Bandeira:</span> ${bandeira}</p>
              <p style="margin:0 0 8px 0;"><span style="color:#5a6b7a;">Limite aprovado:</span> <strong>R$ ${limite}</strong></p>
              <p style="margin:0;"><span style="color:#5a6b7a;">Data:</span> ${dataApr}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:0 28px 24px 28px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#5a6b7a;">
        Acesse o app ou o internet banking para gerenciar limites, fatura e bloqueios. Nunca informe senha ou CVV por e-mail.
      </td>
    </tr>`;

    const text = [
      `Olá, ${primeiroNomeFromCompleto(data.nome)},`,
      '',
      `Status do cartão: ${statusRaw}`,
      `Modalidade: ${data.tipo || '—'}`,
      `Bandeira: ${data.bandeira || '—'}`,
      `Limite: R$ ${formatMoneyBR(data.limite)}`,
      `Data: ${data.dataAprovacao ? new Date(data.dataAprovacao).toLocaleString('pt-BR') : '—'}`,
      '',
      'Gerencie seu cartão pelo app ou internet banking.',
      securityFooterText(),
    ].join('\n');

    return {
      subject: `Cartão ${statusTitle} - AgilBank`,
      html: wrapEmailDocument({
        preheader: `Cartão ${statusTitle} — AgilBank`,
        innerRowsHtml: inner,
      }),
      text,
    };
  },

  /** Cartão de crédito aprovado (mesmo fluxo que notificação in-app card_approved). */
  cardApproved: (data) => {
    const primeiroEsc = escapeHtml(primeiroNomeFromCompleto(data.nome));
    const limiteFmt = formatMoneyBR(data.limite);
    const statusRaw = data.status != null ? String(data.status) : 'aprovado';
    const statusEsc = escapeHtml(humanizeStatus(statusRaw));

    const inner = `
    <tr>
      <td style="padding:24px 28px 8px 28px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.55;color:#1a2b3c;">
        <p style="margin:0 0 12px 0;">Olá, <strong>${primeiroEsc}</strong>.</p>
        <p style="margin:0 0 12px 0;">Seu cartão de crédito AgilBank foi <strong>aprovado</strong>.</p>
        <p style="margin:0 0 12px 0;"><strong>Limite aprovado:</strong> R$ ${limiteFmt}</p>
        <p style="margin:0 0 12px 0;"><strong>Status:</strong> ${statusEsc}</p>
        <p style="margin:0 0 12px 0;font-size:14px;color:#5a6b7a;">Acesse sua conta para acompanhar a emissão e os detalhes do cartão (Meus cartões).</p>
        <p style="margin:0;font-size:14px;color:#5a6b7a;">Caso exista cobrança de frete para envio físico, ela aparecerá na área de Cobranças após a solicitação de envio.</p>
      </td>
    </tr>
    <tr>
      <td style="padding:0 28px 28px 28px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#5a6b7a;">
        AgilBank
      </td>
    </tr>`;

    const text = [
      `Olá, ${primeiroNomeFromCompleto(data.nome)}.`,
      '',
      'Seu cartão de crédito AgilBank foi aprovado.',
      '',
      `Limite aprovado: R$ ${formatMoneyBR(data.limite)}.`,
      '',
      'Acesse sua conta para acompanhar a emissão e os detalhes do cartão (Meus cartões).',
      'Caso exista cobrança de frete para envio físico, ela aparecerá na área de Cobranças após a solicitação de envio.',
      '',
      'AgilBank',
      securityFooterText(),
    ].join('\n');

    return {
      subject: 'Seu cartão AgilBank foi aprovado',
      html: wrapEmailDocument({
        preheader: 'Cartão aprovado — AgilBank',
        innerRowsHtml: inner,
      }),
      text,
    };
  },

  /** Empréstimo aprovado automaticamente com crédito em saldo bloqueado (com/sem seguro). */
  loanApprovedBlocked: (data) => {
    const primeiroEsc = escapeHtml(primeiroNomeFromCompleto(data.nome));
    const valorFmt = formatMoneyBR(data.valor);
    const acaoRaw =
      data.acaoDesbloqueio != null && String(data.acaoDesbloqueio).trim() !== ''
        ? String(data.acaoDesbloqueio).trim()
        : 'Acesse o app para ver os próximos passos.';
    const acaoEsc = escapeHtml(acaoRaw).replace(/\n/g, '<br>');

    const inner = `
    <tr>
      <td style="padding:24px 28px 8px 28px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.55;color:#1a2b3c;">
        <p style="margin:0 0 12px 0;">Olá, <strong>${primeiroEsc}</strong>.</p>
        <p style="margin:0 0 12px 0;">Seu empréstimo foi <strong>aprovado</strong>.</p>
        <p style="margin:0 0 12px 0;">O valor de <strong>R$ ${valorFmt}</strong> já foi reservado na sua conta AgilBank como <strong>saldo bloqueado</strong>.</p>
        <p style="margin:0 0 8px 0;"><strong>Para desbloquear o valor, siga a orientação abaixo:</strong></p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f8fb;border-radius:8px;border-left:4px solid #00a3e0;">
          <tr>
            <td style="padding:16px 18px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1a2b3c;">
              ${acaoEsc}
            </td>
          </tr>
        </table>
        <p style="margin:16px 0 0 0;font-size:14px;color:#5a6b7a;">Acesse sua conta no app para acompanhar os detalhes.</p>
      </td>
    </tr>`;

    const text = [
      `Olá, ${primeiroNomeFromCompleto(data.nome)}.`,
      '',
      'Seu empréstimo foi aprovado.',
      '',
      `O valor de R$ ${formatMoneyBR(data.valor)} já foi reservado na sua conta AgilBank como saldo bloqueado.`,
      '',
      'Para desbloquear o valor, siga a orientação abaixo:',
      '',
      acaoRaw,
      '',
      'Acesse sua conta para acompanhar os detalhes.',
      securityFooterText(),
    ].join('\n');

    return {
      subject: 'Seu empréstimo AgilBank foi aprovado',
      html: wrapEmailDocument({
        preheader: 'Empréstimo aprovado — valor em saldo bloqueado',
        innerRowsHtml: inner,
      }),
      text,
    };
  },
};

function isResendConfigured() {
  const key = process.env.RESEND_API_KEY && String(process.env.RESEND_API_KEY).trim();
  return Boolean(key);
}

/** Remetente: prioriza EMAIL_FROM; fora de produção aceita SMTP_USER como compatibilidade local. */
function getFromEmailRaw() {
  const from = process.env.EMAIL_FROM && String(process.env.EMAIL_FROM).trim();
  if (from) return from;
  const user = process.env.SMTP_USER && String(process.env.SMTP_USER).trim();
  return user || '';
}

/**
 * Resend oficial: API key + remetente utilizável.
 * Em produção exige EMAIL_FROM explícito (domínio verificado no Resend); não usar só SMTP_USER como remetente.
 */
function isResendReady() {
  if (!isResendConfigured()) return false;
  if (process.env.NODE_ENV === 'production') {
    const from = process.env.EMAIL_FROM && String(process.env.EMAIL_FROM).trim();
    return Boolean(from);
  }
  return Boolean(getFromEmailRaw());
}

function isSmtpConfigured() {
  const host = process.env.SMTP_HOST && String(process.env.SMTP_HOST).trim();
  const user = process.env.SMTP_USER && String(process.env.SMTP_USER).trim();
  const pass = process.env.SMTP_PASS && String(process.env.SMTP_PASS).trim();
  return Boolean(host && user && pass);
}

/**
 * SMTP/Nodemailer é legado. Em produção só é elegível com opt-in explícito (rede muitas vezes bloqueia saída 587).
 * Fora de produção permanece permitido por padrão para desenvolvimento local.
 */
function isSmtpFallbackAllowed() {
  if (process.env.NODE_ENV === 'production') {
    const v = String(process.env.ALLOW_EMAIL_SMTP_FALLBACK || '').trim().toLowerCase();
    return v === 'true' || v === '1' || v === 'yes';
  }
  return true;
}

/** Provedor disponível: Resend (oficial) ou SMTP apenas quando explicitamente permitido. */
function isEmailProviderConfigured() {
  return isResendReady() || (isSmtpConfigured() && isSmtpFallbackAllowed());
}

function buildMimeFromHeader() {
  const name = process.env.EMAIL_FROM_NAME || 'AgilBank';
  const addr = getFromEmailRaw();
  if (!addr) return null;
  return `"${name}" <${addr}>`;
}

/**
 * Envio via Resend HTTP API (evita bloqueio de SMTP outbound em alguns PaaS).
 * Não logar corpo da requisição nem cabeçalhos com API key.
 */
async function sendViaResend({ to, finalSubject, html, textPart }) {
  const apiKey = String(process.env.RESEND_API_KEY || '').trim();
  const from = buildMimeFromHeader();
  if (!from) {
    throw new Error('RESEND_REQUIRES_EMAIL_FROM');
  }

  const payload = {
    from,
    to: Array.isArray(to) ? to : [to],
    subject: finalSubject,
  };
  if (html && String(html).trim() !== '') {
    payload.html = html;
  }
  if (textPart && String(textPart).trim() !== '') {
    payload.text = textPart;
  }
  if (!payload.html && !payload.text) {
    throw new Error('RESEND_REQUIRES_HTML_OR_TEXT');
  }

  let response;
  try {
    response = await axios.post(RESEND_API_URL, payload, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
      validateStatus: () => true,
    });
  } catch (err) {
    logger.error(err, {
      context: 'sendEmail',
      provider: 'resend',
      phase: 'network',
      to,
      subject: finalSubject,
    });
    throw err;
  }

  if (response.status >= 200 && response.status < 300) {
    const id = response.data && response.data.id ? response.data.id : null;
    return { messageId: id || undefined };
  }

  const apiMsg =
    response.data && typeof response.data === 'object'
      ? response.data.message || response.data.name || JSON.stringify(response.data)
      : String(response.data || '');
  const err = new Error(`RESEND_API_ERROR_${response.status}`);
  err.resendStatus = response.status;
  err.resendMessage = typeof apiMsg === 'string' ? apiMsg : String(apiMsg);
  logger.error(err, {
    context: 'sendEmail',
    provider: 'resend',
    to,
    subject: finalSubject,
    httpStatus: response.status,
    resendMessage: err.resendMessage,
  });
  throw err;
}

function resolveSubject(passedSubject, templateSubject) {
  if (passedSubject !== undefined && passedSubject !== null && String(passedSubject).trim() !== '') {
    return String(passedSubject).trim();
  }
  return templateSubject;
}

const sendEmail = async ({ to, subject, html, text, template, data = {} }) => {
  let emailContent;
  try {
    if (!isEmailProviderConfigured()) {
      const msg =
        'E-mail não enviado: configure RESEND_API_KEY e EMAIL_FROM (produção/Railway) ou, para SMTP legado, SMTP_* e em produção também ALLOW_EMAIL_SMTP_FALLBACK=true. Veja env.example.';
      logger.warn(msg);
      throw new Error('EMAIL_PROVIDER_NOT_CONFIGURED');
    }

    if (template && emailTemplates[template]) {
      emailContent = emailTemplates[template](data);
    } else {
      emailContent = { subject, html, text };
    }

    const finalSubject = resolveSubject(subject, emailContent.subject);

    let textPart = '';
    if (emailContent.text && String(emailContent.text).trim() !== '') {
      textPart = emailContent.text;
    } else if (text && String(text).trim() !== '') {
      textPart = text;
    }

    if (isResendReady()) {
      const result = await sendViaResend({
        to,
        finalSubject,
        html: emailContent.html,
        textPart: textPart || undefined,
      });

      logger.info(
        {
          to,
          subject: finalSubject,
          messageId: result.messageId,
          provider: 'resend',
        },
        'Email enviado com sucesso',
      );

      return {
        success: true,
        messageId: result.messageId,
      };
    }

    const transporter = buildSmtpTransport();

    const mailOptions = {
      from: buildMimeFromHeader() || `"${process.env.EMAIL_FROM_NAME || 'AgilBank'}" <${process.env.SMTP_USER}>`,
      to,
      subject: finalSubject,
      html: emailContent.html,
    };
    if (textPart) {
      mailOptions.text = textPart;
    }

    const result = await transporter.sendMail(mailOptions);

    logger.info(
      {
        to,
        subject: finalSubject,
        messageId: result.messageId,
        provider: 'smtp',
      },
      'Email enviado com sucesso',
    );

    return {
      success: true,
      messageId: result.messageId,
    };
  } catch (error) {
    const logSubject =
      emailContent && typeof emailContent.subject === 'string'
        ? resolveSubject(subject, emailContent.subject)
        : subject;
    logger.error(error, {
      to,
      subject: logSubject,
      context: 'sendEmail',
    });

    throw error;
  }
};

const sendWelcomeEmail = async (userData) => {
  return await sendEmail({
    to: userData.email,
    template: 'welcome',
    data: userData,
  });
};

const sendPasswordResetEmail = async (userData) => {
  return await sendEmail({
    to: userData.email,
    template: 'passwordReset',
    data: userData,
  });
};

const sendTransactionNotification = async (userData, transactionData) => {
  return await sendEmail({
    to: userData.email,
    template: 'transactionNotification',
    data: {
      ...userData,
      ...transactionData,
    },
  });
};

const sendCardNotification = async (userData, cardData) => {
  return await sendEmail({
    to: userData.email,
    template: 'cardNotification',
    data: {
      ...userData,
      ...cardData,
    },
  });
};

const sendLoanApprovedBlockedEmail = async (userData, loanData) => {
  return await sendEmail({
    to: userData.email,
    template: 'loanApprovedBlocked',
    data: {
      nome: userData.nomeCompleto || userData.nome,
      valor: loanData.valor,
      acaoDesbloqueio: loanData.acaoDesbloqueio,
    },
  });
};

const sendCardApprovedEmail = async (userData, cardData) => {
  return await sendEmail({
    to: userData.email,
    template: 'cardApproved',
    data: {
      nome: userData.nomeCompleto || userData.nome,
      limite: cardData.limite,
      status: cardData.status,
    },
  });
};

const testEmailConfiguration = async () => {
  try {
    if (isResendReady()) {
      logger.info('Configuração de e-mail: Resend (RESEND_API_KEY + remetente) presente — envio real não testado aqui.');
      return true;
    }
    if (!isSmtpConfigured()) {
      logger.warn('testEmailConfiguration: nem Resend nem SMTP configurados.');
      return false;
    }
    if (!isSmtpFallbackAllowed()) {
      logger.warn(
        'testEmailConfiguration: SMTP configurado porém fallback desabilitado neste ambiente (defina ALLOW_EMAIL_SMTP_FALLBACK=true se for intencional).',
      );
      return false;
    }
    const transporter = buildSmtpTransport();
    await transporter.verify();
    logger.info('Configuração de email verificada com sucesso (SMTP verify).');
    return true;
  } catch (error) {
    logger.error(error, { context: 'testEmailConfiguration' });
    return false;
  }
};

module.exports = {
  sendEmail,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendTransactionNotification,
  sendCardNotification,
  sendCardApprovedEmail,
  sendLoanApprovedBlockedEmail,
  testEmailConfiguration,
  isResendReady,
  isSmtpFallbackAllowed,
  isEmailProviderConfigured,
};
