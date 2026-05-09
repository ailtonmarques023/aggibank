'use strict';

const crypto = require('crypto');

const SHIPMENT_SOLICITACAO = 'CARD_SHIPMENT';

function generateBarcode44() {
  let barcode = '';
  for (let i = 0; i < 44; i += 1) {
    barcode += Math.floor(Math.random() * 10);
  }
  return barcode;
}

function resolvePixReceiverKey() {
  const k = process.env.PIX_RECEIVER_KEY;
  if (k == null || String(k).trim() === '') return null;
  return String(k).trim();
}

function mapToPublicCobranca(boleto, pixFromEnv) {
  return {
    id: boleto.id,
    protocolo: boleto.protocolo,
    cpfOuCnpj: boleto.cpfOuCnpj,
    solicitacaoTipo: boleto.solicitacaoTipo,
    solicitacaoId: boleto.solicitacaoId,
    valor: Number(boleto.valor),
    codigoBarras: boleto.codigoBarras,
    dataVencimento: boleto.dataVencimento,
    descricao: boleto.descricao,
    beneficiario: boleto.beneficiario,
    status: boleto.status,
    pixCopiaECola: pixFromEnv,
    qrCodePix: boleto.qrCodePix ?? null,
    pixReceiverKey: pixFromEnv,
  };
}

/**
 * Cobrança GRU: lê boleto pendente vinculado ou cria a partir de remessa de cartão com taxa pendente.
 * pixCopiaECola / pixReceiverKey na resposta vêm sempre de process.env.PIX_RECEIVER_KEY (nunca mascarar erro com chave falsa).
 */
async function getOrCreateGruCobranca(prisma, userId) {
  const pixFromEnv = resolvePixReceiverKey();

  const pendingWithLink = await prisma.boleto.findFirst({
    where: {
      userId,
      status: 'pendente',
      OR: [
        { protocolo: { not: null } },
        { AND: [{ solicitacaoTipo: { not: null } }, { solicitacaoId: { not: null } }] },
      ],
    },
    orderBy: { createdAt: 'desc' },
  });

  if (pendingWithLink) {
    return { cobranca: mapToPublicCobranca(pendingWithLink, pixFromEnv) };
  }

  const shipment = await prisma.cardShipment.findFirst({
    where: {
      userId,
      shippingFeeStatus: 'PENDENTE',
      status: 'AGUARDANDO_COBRANCA',
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!shipment) {
    return { notFound: true };
  }

  const existingBySolic = await prisma.boleto.findUnique({
    where: {
      solicitacaoTipo_solicitacaoId: {
        solicitacaoTipo: SHIPMENT_SOLICITACAO,
        solicitacaoId: shipment.id,
      },
    },
  });

  if (existingBySolic) {
    return { cobranca: mapToPublicCobranca(existingBySolic, pixFromEnv) };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { cpf: true },
  });
  if (!user) {
    return { notFound: true };
  }

  const protocolo = `GRU-${crypto.randomBytes(12).toString('hex').toUpperCase()}`;
  const codigoBarras = generateBarcode44();
  const dataVencimento = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const descricao = 'Taxa de envio do cartão — GRU';
  const beneficiario = 'AgilBank';

  try {
    const created = await prisma.boleto.create({
      data: {
        userId,
        codigoBarras,
        valor: shipment.shippingFeeAmount,
        dataVencimento,
        descricao,
        beneficiario,
        status: 'pendente',
        protocolo,
        cpfOuCnpj: user.cpf,
        solicitacaoTipo: SHIPMENT_SOLICITACAO,
        solicitacaoId: shipment.id,
        pixCopiaECola: pixFromEnv,
        pixReceiverKey: pixFromEnv,
        qrCodePix: null,
      },
    });
    return { cobranca: mapToPublicCobranca(created, pixFromEnv) };
  } catch (err) {
    if (err && err.code === 'P2002') {
      const row = await prisma.boleto.findUnique({
        where: {
          solicitacaoTipo_solicitacaoId: {
            solicitacaoTipo: SHIPMENT_SOLICITACAO,
            solicitacaoId: shipment.id,
          },
        },
      });
      if (row) return { cobranca: mapToPublicCobranca(row, pixFromEnv) };
    }
    throw err;
  }
}

module.exports = {
  getOrCreateGruCobranca,
  resolvePixReceiverKey,
  SHIPMENT_SOLICITACAO,
};
