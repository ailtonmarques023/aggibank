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

const {
  registrarCreditoLiberadoDeBloqueado,
  registrarCreditoSaldoAtual,
  LedgerError,
} = require('../src/services/ledgerService');
const { settlePaidPixCobrancaInTx, amountsMatch } = require('../src/services/pixSettlementService');

describe('pixSettlementService', () => {
  const tx = () => ({
    movimentacao: { findUnique: jest.fn() },
    loanInsuranceCharge: { findFirst: jest.fn(), updateMany: jest.fn() },
    emprestimo: { findUnique: jest.fn(), update: jest.fn() },
    boleto: { findFirst: jest.fn(), updateMany: jest.fn() },
    cardShipment: { findFirst: jest.fn(), updateMany: jest.fn() },
    cardShipmentEvent: { create: jest.fn() },
    accountDeposit: { findFirst: jest.fn(), updateMany: jest.fn(), update: jest.fn() },
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('amountsMatch compara centavos', () => {
    expect(amountsMatch('39.90', 39.9)).toBe(true);
    expect(amountsMatch(10, '9.99')).toBe(false);
  });

  it('INVALID_STATE quando PixCobranca não está PAGA', async () => {
    const prismaTx = tx();
    const r = await settlePaidPixCobrancaInTx(prismaTx, {
      pixCobranca: { status: 'ATIVA', id: 'c1' },
    });
    expect(r.settlementResult).toBe('INVALID_STATE');
  });

  it('UNSUPPORTED_ENTITY para tipo desconhecido', async () => {
    const prismaTx = tx();
    const r = await settlePaidPixCobrancaInTx(prismaTx, {
      pixCobranca: {
        id: 'c1',
        status: 'PAGA',
        userId: 'u1',
        linkedEntityType: 'unknown',
        linkedEntityId: 'x1',
        amount: 10,
        paidAt: new Date(),
      },
    });
    expect(r.settlementResult).toBe('UNSUPPORTED_ENTITY');
  });

  it('loan_insurance SETTLED libera principal sem débito de taxa', async () => {
    const prismaTx = tx();
    prismaTx.movimentacao.findUnique.mockResolvedValue(null);
    prismaTx.loanInsuranceCharge.findFirst.mockResolvedValue({
      id: 'lic1',
      loanId: 'loan1',
      userId: 'u1',
      amount: 39.9,
      status: 'pendente',
    });
    prismaTx.emprestimo.findUnique.mockResolvedValue({
      id: 'loan1',
      userId: 'u1',
      status: 'aprovado',
      insuranceSelected: true,
      insuranceChargeStatus: 'pendente',
      valorAprovado: 5000,
    });
    prismaTx.loanInsuranceCharge.updateMany.mockResolvedValue({ count: 1 });
    registrarCreditoLiberadoDeBloqueado.mockResolvedValue({ id: 'movCred' });
    prismaTx.emprestimo.update.mockResolvedValue({});

    const r = await settlePaidPixCobrancaInTx(prismaTx, {
      pixCobranca: {
        id: 'pix1',
        status: 'PAGA',
        userId: 'u1',
        linkedEntityType: 'loan_insurance',
        linkedEntityId: 'lic1',
        amount: 39.9,
        paidAt: new Date(),
      },
    });

    expect(r.settlementResult).toBe('SETTLED');
    expect(registrarCreditoLiberadoDeBloqueado).toHaveBeenCalledWith(
      prismaTx,
      expect.objectContaining({
        userId: 'u1',
        valorLiberado: 5000,
        idempotencyKey: 'loan_insurance_release_pix:pix1',
      }),
    );
    expect(registrarCreditoLiberadoDeBloqueado.mock.calls[0][1]).not.toHaveProperty('valorDebito');
    expect(typeof r.postCommit).toBe('function');
  });

  it('loan_insurance AMOUNT_MISMATCH', async () => {
    const prismaTx = tx();
    prismaTx.movimentacao.findUnique.mockResolvedValue(null);
    prismaTx.loanInsuranceCharge.findFirst.mockResolvedValue({
      id: 'lic1',
      loanId: 'loan1',
      userId: 'u1',
      amount: 40,
      status: 'pendente',
    });

    const r = await settlePaidPixCobrancaInTx(prismaTx, {
      pixCobranca: {
        id: 'pix1',
        status: 'PAGA',
        userId: 'u1',
        linkedEntityType: 'loan_insurance',
        linkedEntityId: 'lic1',
        amount: 39.9,
        paidAt: new Date(),
      },
    });
    expect(r.settlementResult).toBe('AMOUNT_MISMATCH');
    expect(registrarCreditoLiberadoDeBloqueado).not.toHaveBeenCalled();
  });

  it('loan_insurance propaga LedgerError para rollback da transação', async () => {
    const prismaTx = tx();
    prismaTx.movimentacao.findUnique.mockResolvedValue(null);
    prismaTx.loanInsuranceCharge.findFirst.mockResolvedValue({
      id: 'lic1',
      loanId: 'loan1',
      userId: 'u1',
      amount: 39.9,
      status: 'pendente',
    });
    prismaTx.emprestimo.findUnique.mockResolvedValue({
      id: 'loan1',
      userId: 'u1',
      status: 'aprovado',
      insuranceSelected: true,
      insuranceChargeStatus: 'pendente',
      valorAprovado: 5000,
    });
    prismaTx.loanInsuranceCharge.updateMany.mockResolvedValue({ count: 1 });
    registrarCreditoLiberadoDeBloqueado.mockRejectedValue(
      new LedgerError('INSUFFICIENT_BLOCKED_BALANCE', 'bloqueado insuficiente'),
    );

    await expect(
      settlePaidPixCobrancaInTx(prismaTx, {
        pixCobranca: {
          id: 'pix1',
          status: 'PAGA',
          userId: 'u1',
          linkedEntityType: 'loan_insurance',
          linkedEntityId: 'lic1',
          amount: 39.9,
          paidAt: new Date(),
        },
      }),
    ).rejects.toThrow(LedgerError);
  });

  it('loan_insurance ALREADY_SETTLED quando movimentação idempotente existe', async () => {
    const prismaTx = tx();
    prismaTx.movimentacao.findUnique.mockResolvedValue({ id: 'existing' });
    const r = await settlePaidPixCobrancaInTx(prismaTx, {
      pixCobranca: {
        id: 'pix1',
        status: 'PAGA',
        userId: 'u1',
        linkedEntityType: 'loan_insurance',
        linkedEntityId: 'lic1',
        amount: 39.9,
        paidAt: new Date(),
      },
    });
    expect(r.settlementResult).toBe('ALREADY_SETTLED');
  });

  it('card_shipment SETTLED sem movimentação de débito', async () => {
    const prismaTx = tx();
    prismaTx.cardShipment.findFirst.mockResolvedValue({
      id: 'sh1',
      userId: 'u1',
      status: 'AGUARDANDO_COBRANCA',
      shippingFeeStatus: 'PENDENTE',
      shippingFeeAmount: 39.9,
    });
    prismaTx.cardShipment.updateMany.mockResolvedValue({ count: 1 });
    prismaTx.cardShipmentEvent.create.mockResolvedValue({});

    const r = await settlePaidPixCobrancaInTx(prismaTx, {
      pixCobranca: {
        id: 'pix2',
        status: 'PAGA',
        userId: 'u1',
        linkedEntityType: 'card_shipment',
        linkedEntityId: 'sh1',
        amount: 39.9,
        paidAt: new Date(),
      },
    });
    expect(r.settlementResult).toBe('SETTLED');
    expect(prismaTx.cardShipment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          shippingFeeMovementId: null,
          shippingFeeStatus: 'DEBITADO',
        }),
      }),
    );
    expect(registrarCreditoLiberadoDeBloqueado).not.toHaveBeenCalled();
  });

  it('account_deposit SETTLED credita saldo via ledger com idempotência', async () => {
    const prismaTx = tx();
    prismaTx.movimentacao.findUnique.mockResolvedValue(null);
    prismaTx.accountDeposit.findFirst.mockResolvedValue({
      id: 'dep1',
      userId: 'u1',
      amount: 50,
      status: 'PIX_GERADO',
      pixCobrancaId: 'pix1',
    });
    prismaTx.accountDeposit.updateMany.mockResolvedValue({ count: 1 });
    registrarCreditoSaldoAtual.mockResolvedValue({ id: 'movDep1' });
    prismaTx.accountDeposit.update.mockResolvedValue({});

    const r = await settlePaidPixCobrancaInTx(prismaTx, {
      pixCobranca: {
        id: 'pix1',
        status: 'PAGA',
        userId: 'u1',
        linkedEntityType: 'account_deposit',
        linkedEntityId: 'dep1',
        amount: 50,
        paidAt: new Date(),
        grossAmount: 50,
      },
    });

    expect(r.settlementResult).toBe('SETTLED');
    expect(registrarCreditoSaldoAtual).toHaveBeenCalledWith(
      prismaTx,
      expect.objectContaining({
        userId: 'u1',
        valorCredito: 50,
        idempotencyKey: 'pix_deposit_credit:pix1',
        categoria: 'deposito_pix',
      }),
    );
    expect(typeof r.postCommit).toBe('function');
  });

  it('account_deposit AMOUNT_MISMATCH não chama ledger', async () => {
    const prismaTx = tx();
    prismaTx.movimentacao.findUnique.mockResolvedValue(null);
    prismaTx.accountDeposit.findFirst.mockResolvedValue({
      id: 'dep1',
      userId: 'u1',
      amount: 51,
      status: 'PIX_GERADO',
      pixCobrancaId: 'pix1',
    });

    const r = await settlePaidPixCobrancaInTx(prismaTx, {
      pixCobranca: {
        id: 'pix1',
        status: 'PAGA',
        userId: 'u1',
        linkedEntityType: 'account_deposit',
        linkedEntityId: 'dep1',
        amount: 50,
        paidAt: new Date(),
      },
    });

    expect(r.settlementResult).toBe('AMOUNT_MISMATCH');
    expect(registrarCreditoSaldoAtual).not.toHaveBeenCalled();
  });

  it('boleto com CARD_SHIPMENT aciona frete sem duplicar débito ledger', async () => {
    const prismaTx = tx();
    prismaTx.boleto.findFirst.mockResolvedValue({
      id: 'bl1',
      userId: 'u1',
      valor: 39.9,
      status: 'pendente',
      solicitacaoTipo: 'CARD_SHIPMENT',
      solicitacaoId: 'sh1',
    });
    prismaTx.boleto.updateMany.mockResolvedValue({ count: 1 });
    prismaTx.cardShipment.findFirst.mockResolvedValue({
      id: 'sh1',
      userId: 'u1',
      status: 'AGUARDANDO_COBRANCA',
      shippingFeeStatus: 'PENDENTE',
      shippingFeeAmount: 39.9,
    });
    prismaTx.cardShipment.updateMany.mockResolvedValue({ count: 1 });
    prismaTx.cardShipmentEvent.create.mockResolvedValue({});

    const r = await settlePaidPixCobrancaInTx(prismaTx, {
      pixCobranca: {
        id: 'pix3',
        status: 'PAGA',
        userId: 'u1',
        linkedEntityType: 'boleto',
        linkedEntityId: 'bl1',
        amount: 39.9,
        paidAt: new Date(),
      },
    });
    expect(r.settlementResult).toBe('SETTLED');
    expect(registrarCreditoLiberadoDeBloqueado).not.toHaveBeenCalled();
    expect(prismaTx.cardShipmentEvent.create).toHaveBeenCalled();
  });
});
