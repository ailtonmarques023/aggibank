'use strict';

const { prisma } = require('../config/database');
const logger = require('../utils/logger');
const efiPixClient = require('./efiPixClient');
const { PIX_PROVIDER_ID } = require('./pix/pixProviderTypes');

const ACTIVE_PIX_STATUSES = ['CRIADA', 'ATIVA'];

function linkedTypeFromChargeKind(kind) {
  if (kind === 'loan_insurance') return 'loan_insurance';
  if (kind === 'card_shipment') return 'card_shipment';
  if (kind === 'boleto') return 'boleto';
  return null;
}

async function findActivePixCobranca(userId, linkedEntityType, linkedEntityId) {
  const now = new Date();
  return prisma.pixCobranca.findFirst({
    where: {
      userId,
      linkedEntityType,
      linkedEntityId,
      status: { in: ACTIVE_PIX_STATUSES },
      expiresAt: { gt: now },
    },
    orderBy: { createdAt: 'desc' },
  });
}

function mapRowToPixResponse(row) {
  const isEmv = row.pixCopiaECola && /^000201/.test(String(row.pixCopiaECola).trim());
  return {
    pixMode: isEmv ? 'copiaecola' : row.pixCopiaECola ? 'copiaecola' : 'chave',
    pixCopiaECola: row.pixCopiaECola || null,
    pixKey: null,
    amount: Number(row.amount),
    instructions: 'Utilize o código Pix abaixo para realizar o pagamento.',
    txid: row.txid,
    providerReference: row.providerReference,
    qrCodePix: row.qrCodePix || null,
    expiresAt: row.expiresAt.toISOString(),
    paidAt: row.paidAt ? row.paidAt.toISOString() : null,
    pixStatus: row.status,
    source: 'efi',
    provider: row.provider || PIX_PROVIDER_ID.EFI,
  };
}

/**
 * Obtém ou cria cobrança Pix na Efí (sandbox/prod conforme env) e persiste PixCobranca.
 * Não altera saldo, não marca entidade como paga, não faz settlement.
 */
async function getOrCreateEfiPixForCharge({
  userId,
  chargeKind,
  linkedEntityId,
  amount,
  debtorCpf,
  debtorName,
}) {
  const linkedEntityType = linkedTypeFromChargeKind(chargeKind);
  if (!linkedEntityType) {
    throw new efiPixClient.EfiPixClientError('CHARGE_KIND_INVALID', 'Tipo de cobrança inválido', 400);
  }

  if (!efiPixClient.isEfiPixConfigured()) {
    throw new efiPixClient.EfiPixClientError('EFI_NOT_CONFIGURED', 'Integração Efí Pix não configurada', 503);
  }

  const existing = await findActivePixCobranca(userId, linkedEntityType, linkedEntityId);
  if (existing) {
    return mapRowToPixResponse(existing);
  }

  const txid = efiPixClient.generateTxid();
  const idempotencyKey = `efi_emit:${linkedEntityType}:${linkedEntityId}:${txid}`;

  let efiResult;
  try {
    efiResult = await efiPixClient.createImmediateCob({
      txid,
      amount,
      debtorCpf,
      debtorName,
    });
  } catch (e) {
    throw e;
  }

  if (!efiResult.pixCopiaECola) {
    logger.warn('efi_pix_cob_sem_br_code', {
      category: 'operational_error',
      component: 'pixCobrancaEfiService',
      txid: efiResult.txid,
    });
  }

  const row = await prisma.pixCobranca.create({
    data: {
      userId,
      linkedEntityType,
      linkedEntityId,
      amount,
      provider: PIX_PROVIDER_ID.EFI,
      status: efiResult.status || 'ATIVA',
      txid: efiResult.txid,
      providerReference: efiResult.providerReference,
      pixCopiaECola: efiResult.pixCopiaECola,
      qrCodePix: efiResult.qrCodePix,
      expiresAt: efiResult.expiresAt,
      paidAt: null,
      idempotencyKey,
      rawProviderPayload: efiResult.raw || undefined,
    },
  });

  return mapRowToPixResponse(row);
}

module.exports = {
  getOrCreateEfiPixForCharge,
  findActivePixCobranca,
  mapRowToPixResponse,
  linkedTypeFromChargeKind,
  isEfiPixConfigured: () => efiPixClient.isEfiPixConfigured(),
  EfiPixClientError: efiPixClient.EfiPixClientError,
};
