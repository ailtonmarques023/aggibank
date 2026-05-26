'use strict';

jest.mock('../src/utils/auditLog', () => ({
  recordAudit: jest.fn(() => Promise.resolve()),
}));

jest.mock('../src/services/inAppNotificationService', () => ({
  notifyLoanInsuranceSettled: jest.fn(),
  notifyBoletoPago: jest.fn(),
  notifyCardShipmentFreightPixSettled: jest.fn(),
  notifyAccountDepositPixCredited: jest.fn(),
}));

jest.mock('../src/services/ledgerService', () => {
  class LedgerError extends Error {
    constructor(code, message, httpStatus = 400) {
      super(message);
      this.code = code;
      this.name = 'LedgerError';
      this.httpStatus = httpStatus;
    }
  }
  return {
    LedgerError,
    registrarCreditoLiberadoDeBloqueado: jest.fn(),
    registrarDebitoSaldoAtual: jest.fn(),
    registrarCreditoSaldoBloqueado: jest.fn(),
    registrarCreditoSaldoAtual: jest.fn(),
  };
});

const { recordAudit } = require('../src/utils/auditLog');
const {
  registrarCreditoLiberadoDeBloqueado,
  registrarDebitoSaldoAtual,
  LedgerError,
} = require('../src/services/ledgerService');
const {
  settlePaidPixCobrancaInTx,
  settleChargePromotionInTx,
  loanInsurancePromoReleaseKey,
} = require('../src/services/pixSettlementService');

const prevSettlementFlag = process.env.FEATURE_CHARGE_PROMOTION_SETTLEMENT_ENABLED;

function promotionTx() {
  return {
    chargePromotion: { findFirst: jest.fn(), updateMany: jest.fn() },
    loanInsuranceCharge: { findFirst: jest.fn(), updateMany: jest.fn() },
    emprestimo: { findUnique: jest.fn(), update: jest.fn() },
    cardShipment: { findFirst: jest.fn(), updateMany: jest.fn() },
    cardShipmentEvent: { create: jest.fn() },
    boleto: { findFirst: jest.fn(), updateMany: jest.fn() },
    movimentacao: { findUnique: jest.fn() },
  };
}

function basePromotion(overrides = {}) {
  return {
    id: 'promo-1',
    userId: 'u1',
    status: 'ACTIVE',
    originalAmountCents: 7900,
    discountAmountCents: 1185,
    promotionalAmountCents: 6715,
    items: [],
    ...overrides,
  };
}

function basePix(overrides = {}) {
  return {
    id: 'pix-promo-1',
    status: 'PAGA',
    userId: 'u1',
    linkedEntityType: 'charge_promotion',
    linkedEntityId: 'promo-1',
    amount: 67.15,
    paidAt: new Date('2026-05-26T12:00:00.000Z'),
    ...overrides,
  };
}

describe('chargePromotionSettlement (Fatia 4)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.FEATURE_CHARGE_PROMOTION_SETTLEMENT_ENABLED = 'true';
  });

  afterAll(() => {
    if (prevSettlementFlag !== undefined) {
      process.env.FEATURE_CHARGE_PROMOTION_SETTLEMENT_ENABLED = prevSettlementFlag;
    } else {
      delete process.env.FEATURE_CHARGE_PROMOTION_SETTLEMENT_ENABLED;
    }
  });

  it('flag desligada: charge_promotion retorna PROMOTION_SETTLEMENT_PENDING', async () => {
    process.env.FEATURE_CHARGE_PROMOTION_SETTLEMENT_ENABLED = 'false';
    const prismaTx = promotionTx();
    const r = await settlePaidPixCobrancaInTx(prismaTx, {
      pixCobranca: basePix(),
    });
    expect(r.settlementResult).toBe('PROMOTION_SETTLEMENT_PENDING');
    expect(prismaTx.chargePromotion.findFirst).not.toHaveBeenCalled();
    expect(registrarCreditoLiberadoDeBloqueado).not.toHaveBeenCalled();
  });

  it('SETTLED: loan_insurance + card_shipment quita tudo e marca PAID', async () => {
    const prismaTx = promotionTx();
    const promotion = basePromotion({
      items: [
        {
          linkedEntityType: 'loan_insurance',
          linkedEntityId: 'lic-1',
          publicChargeId: 'lic-x',
          originalAmountCents: 3990,
        },
        {
          linkedEntityType: 'card_shipment',
          linkedEntityId: 'sh-1',
          publicChargeId: 'csh-x',
          originalAmountCents: 3990,
        },
      ],
    });

    prismaTx.chargePromotion.findFirst.mockResolvedValue(promotion);
    prismaTx.loanInsuranceCharge.findFirst
      .mockResolvedValueOnce({
        id: 'lic-1',
        loanId: 'loan-1',
        userId: 'u1',
        status: 'pendente',
      })
      .mockResolvedValueOnce({
        id: 'lic-1',
        loanId: 'loan-1',
        userId: 'u1',
        status: 'pendente',
      });
    prismaTx.emprestimo.findUnique
      .mockResolvedValueOnce({
        userId: 'u1',
        status: 'aprovado',
        insuranceSelected: true,
        insuranceChargeStatus: 'pendente',
      })
      .mockResolvedValueOnce({
        id: 'loan-1',
        userId: 'u1',
        status: 'aprovado',
        insuranceSelected: true,
        insuranceChargeStatus: 'pendente',
        valorAprovado: 5000,
      });
    prismaTx.movimentacao.findUnique.mockResolvedValue(null);
    prismaTx.loanInsuranceCharge.updateMany.mockResolvedValue({ count: 1 });
    registrarCreditoLiberadoDeBloqueado.mockResolvedValue({ id: 'mov-cred' });
    prismaTx.emprestimo.update.mockResolvedValue({});
    prismaTx.cardShipment.findFirst
      .mockResolvedValueOnce({
        id: 'sh-1',
        userId: 'u1',
        shippingFeeStatus: 'PENDENTE',
        status: 'AGUARDANDO_COBRANCA',
      })
      .mockResolvedValueOnce({
        id: 'sh-1',
        userId: 'u1',
        shippingFeeStatus: 'PENDENTE',
        status: 'AGUARDANDO_COBRANCA',
      });
    prismaTx.cardShipment.updateMany.mockResolvedValue({ count: 1 });
    prismaTx.cardShipmentEvent.create.mockResolvedValue({});
    prismaTx.chargePromotion.updateMany.mockResolvedValue({ count: 1 });

    const r = await settleChargePromotionInTx(prismaTx, {
      pixCobranca: basePix(),
    });

    expect(r.settlementResult).toBe('SETTLED');
    expect(registrarCreditoLiberadoDeBloqueado).toHaveBeenCalledWith(
      prismaTx,
      expect.objectContaining({
        userId: 'u1',
        valorLiberado: 5000,
        idempotencyKey: loanInsurancePromoReleaseKey('promo-1', 'lic-1'),
      }),
    );
    expect(registrarDebitoSaldoAtual).not.toHaveBeenCalled();
    expect(prismaTx.chargePromotion.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'PAID' }),
      }),
    );
    expect(prismaTx.cardShipmentEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ eventType: 'FRETE_COBRADO' }),
      }),
    );
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'pix.settlement.charge_promotion.settled' }),
    );
  });

  it('SETTLED: boleto quitado', async () => {
    const prismaTx = promotionTx();
    prismaTx.chargePromotion.findFirst.mockResolvedValue(
      basePromotion({
        items: [
          {
            linkedEntityType: 'boleto',
            linkedEntityId: 'blt-1',
            publicChargeId: 'blt-x',
            originalAmountCents: 5000,
          },
          {
            linkedEntityType: 'loan_insurance',
            linkedEntityId: 'lic-2',
            publicChargeId: 'lic-y',
            originalAmountCents: 1715,
          },
        ],
        promotionalAmountCents: 6715,
      }),
    );
    prismaTx.boleto.findFirst
      .mockResolvedValueOnce({ id: 'blt-1', userId: 'u1', status: 'pendente' })
      .mockResolvedValueOnce({
        id: 'blt-1',
        userId: 'u1',
        status: 'pago',
        solicitacaoTipo: null,
      });
    prismaTx.boleto.updateMany.mockResolvedValue({ count: 1 });
    prismaTx.loanInsuranceCharge.findFirst
      .mockResolvedValueOnce({
        id: 'lic-2',
        loanId: 'loan-2',
        userId: 'u1',
        status: 'pendente',
      })
      .mockResolvedValueOnce({
        id: 'lic-2',
        loanId: 'loan-2',
        userId: 'u1',
        status: 'pendente',
      });
    prismaTx.emprestimo.findUnique
      .mockResolvedValueOnce({
        userId: 'u1',
        status: 'aprovado',
        insuranceSelected: true,
        insuranceChargeStatus: 'pendente',
      })
      .mockResolvedValueOnce({
        id: 'loan-2',
        userId: 'u1',
        status: 'aprovado',
        insuranceSelected: true,
        insuranceChargeStatus: 'pendente',
        valorAprovado: 1000,
      });
    prismaTx.movimentacao.findUnique.mockResolvedValue(null);
    prismaTx.loanInsuranceCharge.updateMany.mockResolvedValue({ count: 1 });
    registrarCreditoLiberadoDeBloqueado.mockResolvedValue({ id: 'mov2' });
    prismaTx.emprestimo.update.mockResolvedValue({});
    prismaTx.chargePromotion.updateMany.mockResolvedValue({ count: 1 });

    const r = await settleChargePromotionInTx(prismaTx, {
      pixCobranca: basePix(),
    });
    expect(r.settlementResult).toBe('SETTLED');
    expect(prismaTx.boleto.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'pago' }),
      }),
    );
  });

  it('boleto CARD_SHIPMENT quita frete sem amount match do bundle', async () => {
    const prismaTx = promotionTx();
    prismaTx.chargePromotion.findFirst.mockResolvedValue(
      basePromotion({
        promotionalAmountCents: 6715,
        items: [
          {
            linkedEntityType: 'boleto',
            linkedEntityId: 'blt-gru',
            publicChargeId: 'blt-g',
            originalAmountCents: 3990,
          },
          {
            linkedEntityType: 'loan_insurance',
            linkedEntityId: 'lic-3',
            publicChargeId: 'lic-z',
            originalAmountCents: 2725,
          },
        ],
      }),
    );
    prismaTx.boleto.findFirst
      .mockResolvedValueOnce({ id: 'blt-gru', userId: 'u1', status: 'vencido' })
      .mockResolvedValueOnce({
        id: 'blt-gru',
        userId: 'u1',
        status: 'pago',
        solicitacaoTipo: 'CARD_SHIPMENT',
        solicitacaoId: 'sh-gru',
      });
    prismaTx.boleto.updateMany.mockResolvedValue({ count: 1 });
    prismaTx.cardShipment.findFirst.mockResolvedValue({
      id: 'sh-gru',
      userId: 'u1',
      shippingFeeStatus: 'PENDENTE',
      status: 'AGUARDANDO_COBRANCA',
    });
    prismaTx.cardShipment.updateMany.mockResolvedValue({ count: 1 });
    prismaTx.cardShipmentEvent.create.mockResolvedValue({});
    prismaTx.loanInsuranceCharge.findFirst
      .mockResolvedValueOnce({
        id: 'lic-3',
        loanId: 'loan-3',
        userId: 'u1',
        status: 'pendente',
      })
      .mockResolvedValueOnce({
        id: 'lic-3',
        loanId: 'loan-3',
        userId: 'u1',
        status: 'pendente',
      });
    prismaTx.emprestimo.findUnique
      .mockResolvedValueOnce({
        userId: 'u1',
        status: 'aprovado',
        insuranceSelected: true,
        insuranceChargeStatus: 'pendente',
      })
      .mockResolvedValueOnce({
        id: 'loan-3',
        userId: 'u1',
        status: 'aprovado',
        insuranceSelected: true,
        insuranceChargeStatus: 'pendente',
        valorAprovado: 2000,
      });
    prismaTx.movimentacao.findUnique.mockResolvedValue(null);
    prismaTx.loanInsuranceCharge.updateMany.mockResolvedValue({ count: 1 });
    registrarCreditoLiberadoDeBloqueado.mockResolvedValue({ id: 'mov3' });
    prismaTx.emprestimo.update.mockResolvedValue({});
    prismaTx.chargePromotion.updateMany.mockResolvedValue({ count: 1 });

    const r = await settleChargePromotionInTx(prismaTx, {
      pixCobranca: basePix({ amount: 67.15 }),
    });
    expect(r.settlementResult).toBe('SETTLED');
    expect(prismaTx.cardShipment.updateMany).toHaveBeenCalled();
  });

  it('AMOUNT_MISMATCH não marca PAID', async () => {
    const prismaTx = promotionTx();
    prismaTx.chargePromotion.findFirst.mockResolvedValue(
      basePromotion({
        items: [
          { linkedEntityType: 'boleto', linkedEntityId: 'b1', originalAmountCents: 100 },
          { linkedEntityType: 'boleto', linkedEntityId: 'b2', originalAmountCents: 100 },
        ],
      }),
    );

    const r = await settleChargePromotionInTx(prismaTx, {
      pixCobranca: basePix({ amount: 50 }),
    });
    expect(r.settlementResult).toBe('AMOUNT_MISMATCH');
    expect(prismaTx.chargePromotion.updateMany).not.toHaveBeenCalled();
    expect(prismaTx.boleto.updateMany).not.toHaveBeenCalled();
  });

  it('promoção inexistente: INVALID_STATE', async () => {
    const prismaTx = promotionTx();
    prismaTx.chargePromotion.findFirst.mockResolvedValue(null);
    const r = await settleChargePromotionInTx(prismaTx, { pixCobranca: basePix() });
    expect(r.settlementResult).toBe('INVALID_STATE');
  });

  it('promoção de outro usuário: INVALID_STATE', async () => {
    const prismaTx = promotionTx();
    prismaTx.chargePromotion.findFirst.mockResolvedValue(
      basePromotion({ userId: 'other', items: [{}, {}] }),
    );
    const r = await settleChargePromotionInTx(prismaTx, { pixCobranca: basePix() });
    expect(r.settlementResult).toBe('INVALID_STATE');
  });

  it('promoção PAID: ALREADY_SETTLED', async () => {
    const prismaTx = promotionTx();
    prismaTx.chargePromotion.findFirst.mockResolvedValue(
      basePromotion({ status: 'PAID', items: [{}, {}] }),
    );
    const r = await settleChargePromotionInTx(prismaTx, { pixCobranca: basePix() });
    expect(r.settlementResult).toBe('ALREADY_SETTLED');
    expect(prismaTx.loanInsuranceCharge.updateMany).not.toHaveBeenCalled();
  });

  it('promoção EXPIRED + Pix PAGA: SETTLED', async () => {
    const prismaTx = promotionTx();
    prismaTx.chargePromotion.findFirst.mockResolvedValue(
      basePromotion({
        status: 'EXPIRED',
        items: [
          {
            linkedEntityType: 'card_shipment',
            linkedEntityId: 'sh-e',
            originalAmountCents: 3990,
          },
          {
            linkedEntityType: 'card_shipment',
            linkedEntityId: 'sh-f',
            originalAmountCents: 2725,
          },
        ],
        promotionalAmountCents: 6715,
      }),
    );
    prismaTx.cardShipment.findFirst.mockResolvedValue({
      userId: 'u1',
      shippingFeeStatus: 'PENDENTE',
      status: 'AGUARDANDO_COBRANCA',
    });
    prismaTx.cardShipment.updateMany.mockResolvedValue({ count: 1 });
    prismaTx.cardShipmentEvent.create.mockResolvedValue({});
    prismaTx.chargePromotion.updateMany.mockResolvedValue({ count: 1 });

    const r = await settleChargePromotionInTx(prismaTx, { pixCobranca: basePix() });
    expect(r.settlementResult).toBe('SETTLED');
  });

  it('item já pago: PROMOTION_SETTLEMENT_BLOCKED_ITEM_ALREADY_PAID', async () => {
    const prismaTx = promotionTx();
    prismaTx.chargePromotion.findFirst.mockResolvedValue(
      basePromotion({
        items: [
          {
            linkedEntityType: 'loan_insurance',
            linkedEntityId: 'lic-paid',
            originalAmountCents: 3990,
          },
          {
            linkedEntityType: 'card_shipment',
            linkedEntityId: 'sh-ok',
            originalAmountCents: 2725,
          },
        ],
      }),
    );
    prismaTx.loanInsuranceCharge.findFirst.mockResolvedValue({
      id: 'lic-paid',
      userId: 'u1',
      status: 'pago',
    });

    const r = await settleChargePromotionInTx(prismaTx, { pixCobranca: basePix() });
    expect(r.settlementResult).toBe('PROMOTION_SETTLEMENT_BLOCKED_ITEM_ALREADY_PAID');
    expect(prismaTx.chargePromotion.updateMany).not.toHaveBeenCalled();
  });

  it('tipo desconhecido: UNSUPPORTED_PROMOTION_ITEM', async () => {
    const prismaTx = promotionTx();
    prismaTx.chargePromotion.findFirst.mockResolvedValue(
      basePromotion({
        items: [
          { linkedEntityType: 'account_deposit', linkedEntityId: 'x', originalAmountCents: 1 },
          { linkedEntityType: 'boleto', linkedEntityId: 'b2', originalAmountCents: 1 },
        ],
      }),
    );
    prismaTx.boleto.findFirst.mockResolvedValue({
      id: 'b2',
      userId: 'u1',
      status: 'pendente',
    });

    const r = await settleChargePromotionInTx(prismaTx, { pixCobranca: basePix() });
    expect(r.settlementResult).toBe('UNSUPPORTED_PROMOTION_ITEM');
    expect(prismaTx.chargePromotion.updateMany).not.toHaveBeenCalled();
  });

  it('loan inválido no pré-check: INVALID_STATE', async () => {
    const prismaTx = promotionTx();
    prismaTx.chargePromotion.findFirst.mockResolvedValue(
      basePromotion({
        items: [
          {
            linkedEntityType: 'loan_insurance',
            linkedEntityId: 'lic-bad',
            originalAmountCents: 3990,
          },
          {
            linkedEntityType: 'card_shipment',
            linkedEntityId: 'sh-bad',
            originalAmountCents: 2725,
          },
        ],
      }),
    );
    prismaTx.loanInsuranceCharge.findFirst.mockResolvedValue({
      id: 'lic-bad',
      loanId: 'loan-bad',
      userId: 'u1',
      status: 'pendente',
    });
    prismaTx.emprestimo.findUnique.mockResolvedValue({
      userId: 'u1',
      status: 'rejeitado',
      insuranceSelected: true,
      insuranceChargeStatus: 'pendente',
    });

    const r = await settleChargePromotionInTx(prismaTx, { pixCobranca: basePix() });
    expect(r.settlementResult).toBe('INVALID_STATE');
    expect(prismaTx.chargePromotion.updateMany).not.toHaveBeenCalled();
  });

  it('card_shipment fora de AGUARDANDO_COBRANCA: bloqueado no pré-check', async () => {
    const prismaTx = promotionTx();
    prismaTx.chargePromotion.findFirst.mockResolvedValue(
      basePromotion({
        items: [
          {
            linkedEntityType: 'card_shipment',
            linkedEntityId: 'sh-wrong',
            originalAmountCents: 3990,
          },
          {
            linkedEntityType: 'loan_insurance',
            linkedEntityId: 'lic-ok2',
            originalAmountCents: 2725,
          },
        ],
      }),
    );
    prismaTx.cardShipment.findFirst.mockResolvedValue({
      id: 'sh-wrong',
      userId: 'u1',
      shippingFeeStatus: 'PENDENTE',
      status: 'ENVIADO',
    });

    const r = await settleChargePromotionInTx(prismaTx, { pixCobranca: basePix() });
    expect(r.settlementResult).toBe('INVALID_STATE');
  });

  it('ledger error propaga para rollback', async () => {
    const prismaTx = promotionTx();
    prismaTx.chargePromotion.findFirst.mockResolvedValue(
      basePromotion({
        items: [
          {
            linkedEntityType: 'loan_insurance',
            linkedEntityId: 'lic-le',
            originalAmountCents: 3990,
          },
          {
            linkedEntityType: 'card_shipment',
            linkedEntityId: 'sh-le',
            originalAmountCents: 2725,
          },
        ],
      }),
    );
    prismaTx.loanInsuranceCharge.findFirst
      .mockResolvedValueOnce({
        id: 'lic-le',
        loanId: 'loan-le',
        userId: 'u1',
        status: 'pendente',
      })
      .mockResolvedValueOnce({
        id: 'lic-le',
        loanId: 'loan-le',
        userId: 'u1',
        status: 'pendente',
      });
    prismaTx.emprestimo.findUnique
      .mockResolvedValueOnce({
        userId: 'u1',
        status: 'aprovado',
        insuranceSelected: true,
        insuranceChargeStatus: 'pendente',
      })
      .mockResolvedValueOnce({
        id: 'loan-le',
        userId: 'u1',
        status: 'aprovado',
        insuranceSelected: true,
        insuranceChargeStatus: 'pendente',
        valorAprovado: 500,
      });
    prismaTx.cardShipment.findFirst
      .mockResolvedValueOnce({
        id: 'sh-le',
        userId: 'u1',
        shippingFeeStatus: 'PENDENTE',
        status: 'AGUARDANDO_COBRANCA',
      })
      .mockResolvedValueOnce({
        id: 'sh-le',
        userId: 'u1',
        shippingFeeStatus: 'PENDENTE',
        status: 'AGUARDANDO_COBRANCA',
      });
    prismaTx.movimentacao.findUnique.mockResolvedValue(null);
    prismaTx.loanInsuranceCharge.updateMany.mockResolvedValue({ count: 1 });
    registrarCreditoLiberadoDeBloqueado.mockRejectedValue(
      new LedgerError('INSUFFICIENT_BLOCKED_BALANCE', 'sem bloqueio'),
    );

    await expect(
      settleChargePromotionInTx(prismaTx, { pixCobranca: basePix() }),
    ).rejects.toThrow(LedgerError);
    expect(prismaTx.chargePromotion.updateMany).not.toHaveBeenCalled();
  });
});
