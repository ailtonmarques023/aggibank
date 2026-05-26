'use strict';

const {
  calculateDiscountCents,
  calculatePromotionalAmountCents,
  buildPromotionQuoteFromCharges,
  isChargeOpen,
  resolveChargeLinkage,
  amountBrlToCents,
} = require('../src/services/chargePromotionService');

describe('chargePromotionService — cálculo em centavos', () => {
  it('15% sobre 7900 retorna desconto 1185 e valor final 6715', () => {
    expect(calculateDiscountCents(7900, 15)).toBe(1185);
    expect(calculatePromotionalAmountCents(7900, 15)).toBe(6715);
  });

  it('cálculo usa centavos inteiros (sem fração de centavo)', () => {
    const discount = calculateDiscountCents(7900, 15);
    const promotional = calculatePromotionalAmountCents(7900, 15);
    expect(Number.isInteger(discount)).toBe(true);
    expect(Number.isInteger(promotional)).toBe(true);
    expect(promotional + discount).toBe(7900);
  });

  it('amountBrlToCents arredonda BRL para centavos', () => {
    expect(amountBrlToCents(39.9)).toBe(3990);
    expect(amountBrlToCents('79,00')).toBe(7900);
  });
});

describe('chargePromotionService — quote', () => {
  it('lista vazia retorna ineligible com items vazio', () => {
    const quote = buildPromotionQuoteFromCharges([]);
    expect(quote).not.toBeNull();
    expect(quote.eligible).toBe(false);
    expect(quote.items).toEqual([]);
    expect(quote.originalAmountCents).toBe(0);
  });

  it('cobrança paga não entra no quote', () => {
    const quote = buildPromotionQuoteFromCharges([
      {
        id: 'lic_a',
        type: 'loan_insurance',
        status: 'pago',
        amount: 39.9,
      },
      {
        id: 'csh_b',
        type: 'card_shipping',
        status: 'pendente',
        amount: 39.9,
      },
    ]);
    expect(quote.items).toHaveLength(1);
    expect(quote.items[0].publicChargeId).toBe('csh_b');
    expect(quote.eligible).toBe(true);
  });

  it('uma cobrança aberta entra no quote e já é elegível', () => {
    const quote = buildPromotionQuoteFromCharges([
      {
        id: 'csh_ship-1',
        type: 'card_shipping',
        status: 'pendente',
        amount: 39.9,
      },
    ]);
    expect(quote.items).toHaveLength(1);
    expect(quote.originalAmountCents).toBe(3990);
    expect(quote.discountAmountCents).toBe(599);
    expect(quote.promotionalAmountCents).toBe(3391);
    expect(quote.eligible).toBe(true);
  });

  it('cobranças abertas entram no quote com totais corretos', () => {
    const quote = buildPromotionQuoteFromCharges([
      {
        id: 'csh_ship-1',
        type: 'card_shipping',
        status: 'pendente',
        amount: 39.0,
      },
      {
        id: 'lic_loan-1',
        type: 'loan_insurance',
        status: 'pendente',
        amount: 40.0,
      },
    ]);
    expect(quote.items).toHaveLength(2);
    expect(quote.originalAmountCents).toBe(7900);
    expect(quote.discountAmountCents).toBe(1185);
    expect(quote.promotionalAmountCents).toBe(6715);
    expect(quote.eligible).toBe(true);
    expect(quote.discountPercent).toBe(15);
  });

  it('itens preservam publicChargeId e publicChargeType', () => {
    const quote = buildPromotionQuoteFromCharges([
      {
        id: 'blt_bol-1',
        type: 'gru_boleto',
        status: 'pendente',
        amount: 39.9,
      },
      {
        id: 'lic_loan-1',
        type: 'loan_insurance',
        status: 'vencido',
        amount: 39.9,
      },
    ]);
    const blt = quote.items.find((i) => i.publicChargeId === 'blt_bol-1');
    const lic = quote.items.find((i) => i.publicChargeId === 'lic_loan-1');
    expect(blt.publicChargeType).toBe('gru_boleto');
    expect(lic.publicChargeType).toBe('loan_insurance');
  });

  it('itens preservam linkedEntityType e linkedEntityId', () => {
    const quote = buildPromotionQuoteFromCharges([
      {
        id: 'csh_ship-99',
        type: 'card_shipping',
        status: 'pendente',
        amount: 39.9,
      },
      {
        id: 'lic_ins-88',
        type: 'loan_insurance',
        status: 'pendente',
        amount: 39.9,
      },
    ]);
    const csh = quote.items.find((i) => i.publicChargeId === 'csh_ship-99');
    expect(csh.linkedEntityType).toBe('card_shipment');
    expect(csh.linkedEntityId).toBe('ship-99');
    const lic = quote.items.find((i) => i.publicChargeId === 'lic_ins-88');
    expect(lic.linkedEntityType).toBe('loan_insurance');
    expect(lic.linkedEntityId).toBe('ins-88');
  });

  it('não duplica item com mesmo linkedEntityType + linkedEntityId', () => {
    const quote = buildPromotionQuoteFromCharges([
      {
        id: 'lic_dup',
        type: 'loan_insurance',
        status: 'pendente',
        amount: 39.9,
      },
      {
        id: 'lic_dup',
        type: 'loan_insurance',
        status: 'pendente',
        amount: 39.9,
      },
      {
        id: 'csh_other',
        type: 'card_shipping',
        status: 'pendente',
        amount: 39.9,
      },
    ]);
    expect(quote.items).toHaveLength(2);
    const licItems = quote.items.filter((i) => i.linkedEntityId === 'dup');
    expect(licItems).toHaveLength(1);
  });
});

describe('chargePromotionService — helpers', () => {
  it('isChargeOpen reconhece pendente e vencido', () => {
    expect(isChargeOpen({ status: 'pendente' })).toBe(true);
    expect(isChargeOpen({ status: 'vencido' })).toBe(true);
    expect(isChargeOpen({ status: 'pago' })).toBe(false);
    expect(isChargeOpen({ status: 'debitado' })).toBe(false);
  });

  it('resolveChargeLinkage alinha tipos público e interno', () => {
    const link = resolveChargeLinkage({
      id: 'blt_abc',
      type: 'gru_boleto',
      status: 'pendente',
      amount: 10,
    });
    expect(link).toEqual({
      publicChargeId: 'blt_abc',
      publicChargeType: 'gru_boleto',
      linkedEntityType: 'boleto',
      linkedEntityId: 'abc',
    });
  });
});
