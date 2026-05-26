'use strict';

const crypto = require('crypto');
const { prisma } = require('../config/database');

const PREFIX = {
  BOLETO: 'blt',
  LOAN_INSURANCE: 'lic',
  CARD_SHIP: 'csh',
};

function chargeProtocol(type, id) {
  const buf = crypto.createHash('sha256').update(`${type}:${id}`).digest();
  const n = buf.readUIntBE(0, 4) % 1000000;
  return `AGIL-COB-${String(n).padStart(6, '0')}`;
}

function normalizeStatusKey(raw) {
  return String(raw || '').trim().toLowerCase();
}

function mapStatusDisplay(raw) {
  const s = normalizeStatusKey(raw);
  const map = {
    pendente: 'Pendente',
    pago: 'Pago',
    cancelado: 'Cancelado',
    vencido: 'Vencido',
    debitado: 'Pago',
    recusado: 'Recusado',
    aguardando_cobranca: 'Pendente',
  };
  if (map[s]) return map[s];
  if (!raw) return '—';
  const u = String(raw);
  return u.charAt(0).toUpperCase() + u.slice(1).toLowerCase();
}

function inferBoletoProduct(b) {
  const d = String(b.descricao || '').toLowerCase();
  if (d.includes('seguro')) return 'Seguro do empréstimo';
  if (d.includes('frete') || d.includes('envio') || d.includes('cartão') || b.solicitacaoTipo === 'CARD_SHIPMENT') {
    return 'Frete do cartão';
  }
  return b.descricao || 'Cobrança';
}

async function hasBoletoForShipment(shipmentId) {
  const row = await prisma.boleto.findUnique({
    where: {
      solicitacaoTipo_solicitacaoId: {
        solicitacaoTipo: 'CARD_SHIPMENT',
        solicitacaoId: shipmentId,
      },
    },
  });
  return !!row;
}

function toPublicChargeSummary(row) {
  if (row.kind === 'boleto') {
    const b = row.boleto;
    return {
      id: `${PREFIX.BOLETO}_${b.id}`,
      type: 'gru_boleto',
      protocol: b.protocolo || chargeProtocol('blt', b.id),
      product: inferBoletoProduct(b),
      description: b.descricao,
      status: normalizeStatusKey(b.status),
      statusLabel: mapStatusDisplay(b.status),
      amount: Number(b.valor),
      createdAt: b.createdAt.toISOString(),
    };
  }
  if (row.kind === 'loan_insurance') {
    const lic = row.lic;
    return {
      id: `${PREFIX.LOAN_INSURANCE}_${lic.id}`,
      type: 'loan_insurance',
      protocol: chargeProtocol('lic', lic.id),
      product: 'Seguro do empréstimo',
      description: 'Taxa de seguro do empréstimo contratado',
      status: normalizeStatusKey(lic.status),
      statusLabel: mapStatusDisplay(lic.status),
      amount: Number(lic.amount),
      createdAt: lic.createdAt.toISOString(),
    };
  }
  const sh = row.shipment;
  return {
    id: `${PREFIX.CARD_SHIP}_${sh.id}`,
    type: 'card_shipping',
    protocol: chargeProtocol('csh', sh.id),
    product: 'Frete do cartão',
    description: 'Frete para envio do cartão físico',
    status: normalizeStatusKey(sh.shippingFeeStatus),
    statusLabel: mapStatusDisplay(sh.shippingFeeStatus),
    amount: Number(sh.shippingFeeAmount),
    createdAt: sh.createdAt.toISOString(),
  };
}

/**
 * Lista cobranças abertas/elegíveis do titular (mesma origem do GET /api/charges).
 * @param {string} userId
 * @returns {Promise<object[]>}
 */
async function listOpenChargeSummariesForUser(userId) {
  const [boletos, loanCharges, shipments] = await Promise.all([
    prisma.boleto.findMany({
      where: { userId, status: { in: ['pendente', 'vencido'] } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.loanInsuranceCharge.findMany({
      where: { userId, status: 'pendente' },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.cardShipment.findMany({
      where: { userId, shippingFeeStatus: 'PENDENTE' },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const summaries = [];

  boletos.forEach((b) => {
    summaries.push({ kind: 'boleto', boleto: b, createdAt: b.createdAt });
  });

  loanCharges.forEach((lic) => {
    summaries.push({ kind: 'loan_insurance', lic, createdAt: lic.createdAt });
  });

  for (const sh of shipments) {
    // eslint-disable-next-line no-await-in-loop
    const linked = await hasBoletoForShipment(sh.id);
    if (!linked) {
      summaries.push({ kind: 'card_shipment', shipment: sh, createdAt: sh.createdAt });
    }
  }

  summaries.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return summaries.map(toPublicChargeSummary);
}

module.exports = {
  PREFIX,
  chargeProtocol,
  normalizeStatusKey,
  mapStatusDisplay,
  inferBoletoProduct,
  hasBoletoForShipment,
  toPublicChargeSummary,
  listOpenChargeSummariesForUser,
};
