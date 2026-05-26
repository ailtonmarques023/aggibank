'use strict';

const { buildPromotionIdempotencyKey } = require('../src/services/chargePromotionService');

describe('chargePromotionService.buildPromotionIdempotencyKey', () => {
  const items = [
    { linkedEntityType: 'loan_insurance', linkedEntityId: 'lic-1' },
    { linkedEntityType: 'card_shipment', linkedEntityId: 'csh-2' },
  ];

  const window = 1_700_000_000;

  it('retorna a mesma chave para o mesmo usuário, conjunto e janela', () => {
    const a = buildPromotionIdempotencyKey('user-1', items, window);
    const b = buildPromotionIdempotencyKey('user-1', [...items].reverse(), window);
    expect(a).toBe(b);
    expect(a).toMatch(/^charge_promo:user-1:[a-f0-9]{32}:1700000000$/);
  });

  it('retorna chave diferente para outro usuário, conjunto ou janela', () => {
    const base = buildPromotionIdempotencyKey('user-1', items, window);
    const otherUser = buildPromotionIdempotencyKey('user-2', items, window);
    const otherSet = buildPromotionIdempotencyKey('user-1', [
      { linkedEntityType: 'boleto', linkedEntityId: 'blt-9' },
    ], window);
    const otherWindow = buildPromotionIdempotencyKey('user-1', items, window + 120);
    expect(otherUser).not.toBe(base);
    expect(otherSet).not.toBe(base);
    expect(otherWindow).not.toBe(base);
  });

  it('exige userId', () => {
    expect(() => buildPromotionIdempotencyKey('', items, window)).toThrow(
      'CHARGE_PROMOTION_IDEMPOTENCY_USER_REQUIRED'
    );
  });
});
