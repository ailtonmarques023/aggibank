'use strict';

const { prisma } = require('../config/database');
const logger = require('../utils/logger');
const pixProviderService = require('./pix/pixProviderService');
const { parseValidatedDepositAmount } = require('../utils/depositAmount');
const { EfiPixClientError } = require('./efiPixClient');

/**
 * Cria depósito em conta + PixCobranca Efí com o mesmo valor (sem crédito em saldo).
 *
 * @param {object} params
 * @param {string} params.userId
 * @param {string} params.debtorCpf
 * @param {string} params.debtorName
 * @param {unknown} params.amountRaw
 * @returns {Promise<{ ok: true, deposit: object, pix: object } | { ok: false, httpStatus: number, code: string, message: string }>}
 */
async function createAccountDepositWithPix({ userId, debtorCpf, debtorName, amountRaw }) {
  const parsed = parseValidatedDepositAmount(amountRaw);
  if (!parsed.ok) {
    return {
      ok: false,
      httpStatus: 400,
      code: parsed.code,
      message: parsed.message,
    };
  }

  if (!pixProviderService.isPixChargeProviderConfigured()) {
    return {
      ok: false,
      httpStatus: 503,
      code: 'PIX_PROVIDER_UNAVAILABLE',
      message: 'Geração de Pix indisponível no momento. Tente novamente mais tarde.',
    };
  }

  const amountNum = parsed.value;

  const deposit = await prisma.accountDeposit.create({
    data: {
      userId,
      amount: amountNum,
      status: 'PENDENTE',
      provider: 'EFI',
    },
  });

  try {
    const pix = await pixProviderService.createOrGetPixChargeForCharge({
      userId,
      chargeKind: 'account_deposit',
      linkedEntityId: deposit.id,
      amount: amountNum,
      debtorCpf,
      debtorName,
    });

    const cob = await prisma.pixCobranca.findFirst({
      where: {
        userId,
        linkedEntityType: 'account_deposit',
        linkedEntityId: deposit.id,
        txid: pix.txid,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!cob) {
      logger.error('account_deposit_pix_cob_not_found_after_emit', {
        category: 'operational_error',
        component: 'accountDepositService',
        depositId: deposit.id,
        userId,
        txid: pix.txid || null,
      });
      await prisma.accountDeposit.update({
        where: { id: deposit.id },
        data: { status: 'CANCELADO' },
      });
      return {
        ok: false,
        httpStatus: 500,
        code: 'INTERNAL_ERROR',
        message: 'Não foi possível concluir o depósito. Tente novamente.',
      };
    }

    const amountCob = Number(cob.amount);
    if (!Number.isFinite(amountCob) || Math.round(amountCob * 100) !== Math.round(amountNum * 100)) {
      await prisma.accountDeposit.update({
        where: { id: deposit.id },
        data: { status: 'CANCELADO' },
      });
      return {
        ok: false,
        httpStatus: 500,
        code: 'INTERNAL_ERROR',
        message: 'Inconsistência no valor da cobrança Pix. Tente novamente.',
      };
    }

    const updated = await prisma.accountDeposit.update({
      where: { id: deposit.id },
      data: {
        status: 'PIX_GERADO',
        pixCobrancaId: cob.id,
      },
      include: {
        pixCobranca: {
          select: {
            id: true,
            txid: true,
            status: true,
            amount: true,
            expiresAt: true,
            paidAt: true,
            provider: true,
          },
        },
      },
    });

    return { ok: true, deposit: updated, pix };
  } catch (err) {
    try {
      await prisma.accountDeposit.update({
        where: { id: deposit.id },
        data: { status: 'CANCELADO' },
      });
    } catch (e) {
      logger.error('account_deposit_cancel_after_error_failed', {
        message: e && e.message ? e.message : String(e),
        depositId: deposit.id,
      });
    }

    if (err instanceof EfiPixClientError) {
      const isProviderDown =
        err.httpStatus === 503 ||
        err.code === 'EFI_NOT_CONFIGURED' ||
        err.code === 'EFI_CERT_MISSING';
      return {
        ok: false,
        httpStatus: err.httpStatus >= 400 && err.httpStatus < 600 ? err.httpStatus : 503,
        code: isProviderDown ? 'PIX_PROVIDER_UNAVAILABLE' : err.code,
        message: isProviderDown
          ? 'Geração de Pix indisponível no momento. Tente novamente mais tarde.'
          : err.message,
      };
    }

    throw err;
  }
}

module.exports = {
  createAccountDepositWithPix,
};
