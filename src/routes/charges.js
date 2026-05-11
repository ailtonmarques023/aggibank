'use strict';

const express = require('express');
const crypto = require('crypto');
const { authenticateToken, requireVerification } = require('../middleware/auth');
const { prisma } = require('../config/database');
const logger = require('../utils/logger');
const { resolvePixReceiverKey } = require('../utils/gruCharge');
const efiPixClient = require('../services/efiPixClient');
const pixProviderService = require('../services/pix/pixProviderService');

const router = express.Router();

router.use(authenticateToken);
router.use(requireVerification);

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

function maskCpf(cpf) {
  const d = String(cpf || '').replace(/\D/g, '');
  if (d.length !== 11) return null;
  return `${d.slice(0, 3)}.***.***-${d.slice(9, 11)}`;
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

function parseChargeParam(param) {
  const p = String(param || '').trim();
  if (!p) return null;
  const idx = p.indexOf('_');
  if (idx === -1) return null;
  const kind = p.slice(0, idx);
  const id = p.slice(idx + 1);
  if (!id) return null;
  if (kind === PREFIX.BOLETO) return { kind: 'boleto', id };
  if (kind === PREFIX.LOAN_INSURANCE) return { kind: 'loan_insurance', id };
  if (kind === PREFIX.CARD_SHIP) return { kind: 'card_shipment', id };
  return null;
}

function isEmvPixPayload(s) {
  return /^000201/.test(String(s || '').trim());
}

async function loadBoletoForUser(userId, id) {
  const row = await prisma.boleto.findFirst({
    where: { id, userId },
  });
  return row;
}

async function loadLoanInsuranceForUser(userId, id) {
  return prisma.loanInsuranceCharge.findFirst({
    where: { id, userId },
  });
}

async function loadShipmentForUser(userId, id) {
  return prisma.cardShipment.findFirst({
    where: { id, userId },
  });
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

/** Pix exibido no detalhe: prioriza cobrança paga (webhook Fase O); senão, cob ativa e não expirada. */
async function findPixCobrancaForChargeDetail(userId, linkedEntityType, linkedEntityId) {
  const paid = await prisma.pixCobranca.findFirst({
    where: {
      userId,
      linkedEntityType,
      linkedEntityId,
      status: { in: ['PAGA', 'CONCILIADA'] },
    },
    orderBy: { paidAt: 'desc' },
  });
  if (paid) return paid;
  return prisma.pixCobranca.findFirst({
    where: {
      userId,
      linkedEntityType,
      linkedEntityId,
      status: { in: ['CRIADA', 'ATIVA'] },
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  });
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
 * GET /api/charges — cobranças pendentes (e vencidas pendentes de quitação) do usuário autenticado.
 */
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;

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

    const charges = summaries.map(toPublicChargeSummary);

    if (process.env.AGILBANK_CHARGES_DIAGNOSTIC === 'true' && charges.length === 0) {
      const [
        licAny,
        licPendente,
        shipAny,
        shipFeePendente,
        bolPendenteOuVencido,
      ] = await Promise.all([
        prisma.loanInsuranceCharge.count({ where: { userId } }),
        prisma.loanInsuranceCharge.count({ where: { userId, status: 'pendente' } }),
        prisma.cardShipment.count({ where: { userId } }),
        prisma.cardShipment.count({ where: { userId, shippingFeeStatus: 'PENDENTE' } }),
        prisma.boleto.count({
          where: { userId, status: { in: ['pendente', 'vencido'] } },
        }),
      ]);
      logger.info(
        {
          requestId: req.requestId,
          category: 'charges_diagnostic',
          userId,
          chargesReturned: 0,
          loanInsuranceCharges_total: licAny,
          loanInsuranceCharges_statusPendente: licPendente,
          cardShipments_total: shipAny,
          cardShipments_shippingFeeStatusPENDENTE: shipFeePendente,
          boletos_pendenteOuVencido: bolPendenteOuVencido,
        },
        'GET /api/charges: lista vazia — contagens no banco para o titular do JWT (defina AGILBANK_CHARGES_DIAGNOSTIC=true no Railway para ver este log)'
      );
    }

    return res.json({
      success: true,
      data: { charges },
    });
  } catch (error) {
    logger.error('Erro ao listar cobranças:', {
      requestId: req.requestId,
      error: error && error.message ? error.message : String(error || ''),
    });
    return res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR',
    });
  }
});

function buildChargeDetail(kind, entity, userRow) {
  const cpfMasked = maskCpf(userRow.cpf);
  const name = String(userRow.nomeCompleto || '').trim() || '—';

  if (kind === 'boleto') {
    const b = entity;
    return {
      charge: {
        id: `${PREFIX.BOLETO}_${b.id}`,
        type: 'gru_boleto',
        protocol: b.protocolo || chargeProtocol('blt', b.id),
        product: inferBoletoProduct(b),
        description: b.descricao,
        status: normalizeStatusKey(b.status),
        statusLabel: mapStatusDisplay(b.status),
        amount: Number(b.valor),
        createdAt: b.createdAt.toISOString(),
        dataVencimento: b.dataVencimento ? b.dataVencimento.toISOString() : null,
        codigoBarras: b.codigoBarras || null,
        hasBoletoLinha: !!(b.codigoBarras && String(b.codigoBarras).length >= 40),
        pixCopiaEColaStored: b.pixCopiaECola || null,
        beneficiarioNome: b.beneficiario || null,
        beneficiarioCnpj: process.env.AGILBANK_BENEFICIARIO_CNPJ || null,
      },
      user: {
        name,
        cpf: cpfMasked || '—',
      },
    };
  }

  if (kind === 'loan_insurance') {
    const lic = entity;
    return {
      charge: {
        id: `${PREFIX.LOAN_INSURANCE}_${lic.id}`,
        type: 'loan_insurance',
        protocol: chargeProtocol('lic', lic.id),
        product: 'Seguro do empréstimo',
        description: 'Taxa de seguro do empréstimo contratado',
        status: normalizeStatusKey(lic.status),
        statusLabel: mapStatusDisplay(lic.status),
        amount: Number(lic.amount),
        createdAt: lic.createdAt.toISOString(),
        loanId: lic.loanId,
        codigoBarras: null,
        hasBoletoLinha: false,
        pixCopiaEColaStored: null,
      },
      user: {
        name,
        cpf: cpfMasked || '—',
      },
    };
  }

  const sh = entity;
  return {
    charge: {
      id: `${PREFIX.CARD_SHIP}_${sh.id}`,
      type: 'card_shipping',
      protocol: chargeProtocol('csh', sh.id),
      product: 'Frete do cartão',
      description: 'Frete para envio do cartão físico',
      status: normalizeStatusKey(sh.shippingFeeStatus),
      statusLabel: mapStatusDisplay(sh.shippingFeeStatus),
      amount: Number(sh.shippingFeeAmount),
      createdAt: sh.createdAt.toISOString(),
      codigoBarras: null,
      hasBoletoLinha: false,
      pixCopiaEColaStored: null,
    },
    user: {
      name,
      cpf: cpfMasked || '—',
    },
  };
}

/**
 * GET /api/charges/:id — detalhe de uma cobrança (somente do titular; outro usuário → 404).
 */
router.get('/:id', async (req, res) => {
  try {
    const parsed = parseChargeParam(req.params.id);
    if (!parsed) {
      return res.status(404).json({
        success: false,
        message: 'Cobrança não encontrada',
        code: 'CHARGE_NOT_FOUND',
      });
    }

    const userId = req.user.id;
    let entity = null;

    if (parsed.kind === 'boleto') {
      entity = await loadBoletoForUser(userId, parsed.id);
    } else if (parsed.kind === 'loan_insurance') {
      entity = await loadLoanInsuranceForUser(userId, parsed.id);
    } else {
      entity = await loadShipmentForUser(userId, parsed.id);
    }

    if (!entity) {
      return res.status(404).json({
        success: false,
        message: 'Cobrança não encontrada',
        code: 'CHARGE_NOT_FOUND',
      });
    }

    const userRow = await prisma.user.findUnique({
      where: { id: userId },
      select: { nomeCompleto: true, cpf: true },
    });

    const payload = buildChargeDetail(parsed.kind, entity, userRow);

    const linkedMap = {
      loan_insurance: 'loan_insurance',
      boleto: 'boleto',
      card_shipment: 'card_shipment',
    };
    const linkedEntityType = linkedMap[parsed.kind];
    if (linkedEntityType) {
      const pixRow = await findPixCobrancaForChargeDetail(userId, linkedEntityType, parsed.id);
      if (pixRow) {
        payload.charge.pixStatus = pixRow.status;
        payload.charge.pixCopiaECola = pixRow.pixCopiaECola;
        payload.charge.qrCodePix = pixRow.qrCodePix;
        payload.charge.txid = pixRow.txid;
        payload.charge.pixEndToEndId = pixRow.endToEndId || null;
        payload.charge.providerReference = pixRow.providerReference;
        payload.charge.pixExpiresAt = pixRow.expiresAt.toISOString();
        payload.charge.pixPaidAt = pixRow.paidAt ? pixRow.paidAt.toISOString() : null;
        payload.charge.pixProvider = pixRow.provider || 'EFI';
      } else {
        payload.charge.pixStatus = null;
        payload.charge.pixCopiaECola = null;
        payload.charge.qrCodePix = null;
        payload.charge.txid = null;
        payload.charge.pixEndToEndId = null;
        payload.charge.providerReference = null;
        payload.charge.pixExpiresAt = null;
        payload.charge.pixPaidAt = null;
        payload.charge.pixProvider = null;
      }
    }

    return res.json({
      success: true,
      data: payload,
    });
  } catch (error) {
    logger.error('Erro ao obter cobrança:', {
      requestId: req.requestId,
      error: error && error.message ? error.message : String(error || ''),
    });
    return res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR',
    });
  }
});

/**
 * POST /api/charges/:id/pix — retorna instruções Pix (não marca pago, não altera saldo).
 */
router.post('/:id/pix', async (req, res) => {
  try {
    const parsed = parseChargeParam(req.params.id);
    if (!parsed) {
      return res.status(404).json({
        success: false,
        message: 'Cobrança não encontrada',
        code: 'CHARGE_NOT_FOUND',
      });
    }

    const userId = req.user.id;
    let entity = null;

    if (parsed.kind === 'boleto') {
      entity = await loadBoletoForUser(userId, parsed.id);
    } else if (parsed.kind === 'loan_insurance') {
      entity = await loadLoanInsuranceForUser(userId, parsed.id);
    } else {
      entity = await loadShipmentForUser(userId, parsed.id);
    }

    if (!entity) {
      return res.status(404).json({
        success: false,
        message: 'Cobrança não encontrada',
        code: 'CHARGE_NOT_FOUND',
      });
    }

    if (parsed.kind === 'boleto' && entity.status && entity.status !== 'pendente') {
      return res.status(400).json({
        success: false,
        message: 'Esta cobrança não está pendente de pagamento.',
        code: 'CHARGE_NOT_PAYABLE',
      });
    }
    if (parsed.kind === 'loan_insurance' && entity.status !== 'pendente') {
      return res.status(400).json({
        success: false,
        message: 'Esta cobrança não está pendente de pagamento.',
        code: 'CHARGE_NOT_PAYABLE',
      });
    }
    if (parsed.kind === 'card_shipment' && entity.shippingFeeStatus !== 'PENDENTE') {
      return res.status(400).json({
        success: false,
        message: 'Esta cobrança não está pendente de pagamento.',
        code: 'CHARGE_NOT_PAYABLE',
      });
    }

    const detail = buildChargeDetail(parsed.kind, entity, {
      nomeCompleto: req.user.nomeCompleto,
      cpf: req.user.cpf,
    });

    const amount = detail.charge.amount;

    if (pixProviderService.isPixChargeProviderConfigured()) {
      try {
        const data = await pixProviderService.createOrGetPixChargeForCharge({
          userId,
          chargeKind: parsed.kind,
          linkedEntityId: parsed.id,
          amount,
          debtorCpf: req.user.cpf,
          debtorName: req.user.nomeCompleto,
        });
        return res.json({
          success: true,
          data,
        });
      } catch (err) {
        if (err instanceof efiPixClient.EfiPixClientError) {
          return res.status(err.httpStatus).json({
            success: false,
            message: err.message,
            code: err.code,
          });
        }
        logger.error('Erro ao gerar cobrança Pix (provedor):', {
          requestId: req.requestId,
          error: err && err.message ? err.message : String(err || ''),
        });
        return res.status(500).json({
          success: false,
          message: 'Erro interno do servidor',
          code: 'INTERNAL_ERROR',
        });
      }
    }

    const receiver = resolvePixReceiverKey();
    const stored = detail.charge.pixCopiaEColaStored;

    if (stored && String(stored).trim()) {
      return res.json({
        success: true,
        data: {
          pixMode: isEmvPixPayload(stored) ? 'copiaecola' : 'chave',
          pixCopiaECola: isEmvPixPayload(stored) ? String(stored).trim() : null,
          pixKey: !isEmvPixPayload(stored) ? String(stored).trim() : null,
          amount,
          instructions: 'Utilize o código Pix abaixo para realizar o pagamento.',
        },
      });
    }

    if (!receiver) {
      return res.status(503).json({
        success: false,
        message: 'Pagamento Pix para esta cobrança ainda não está configurado no servidor.',
        code: 'PIX_RECEIVER_NOT_CONFIGURED',
      });
    }

    if (isEmvPixPayload(receiver)) {
      return res.json({
        success: true,
        data: {
          pixMode: 'copiaecola',
          pixCopiaECola: receiver,
          pixKey: null,
          amount,
          instructions: 'Utilize o código Pix copia e cola abaixo para realizar o pagamento.',
        },
      });
    }

    return res.json({
      success: true,
      data: {
        pixMode: 'chave',
        pixCopiaECola: null,
        pixKey: receiver,
        amount,
        instructions: 'Use a chave Pix abaixo para transferir o valor indicado (mesmo titular ou outro banco).',
      },
    });
  } catch (error) {
    logger.error('Erro ao gerar instruções Pix da cobrança:', {
      requestId: req.requestId,
      error: error && error.message ? error.message : String(error || ''),
    });
    return res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR',
    });
  }
});

module.exports = router;
module.exports._test = {
  parseChargeParam,
  maskCpf,
  mapStatusDisplay,
  chargeProtocol,
};
