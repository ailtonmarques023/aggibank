'use strict';

const { buildPromotionIdempotencyKey } = require('../src/services/chargePromotionService');

describe('chargePromotionService.buildPromotionIdempotencyKey', () => {
  const items = [
    { linkedEntityType: 'loan_insurance', linkedEntityId: 'lic-1' },
    { linkedEntityType: 'card_shipment', linkedEntityId: 'csh-2' },
  ];

  it('retorna a mesma chave para o mesmo usuário e conjunto de cobranças', () => {
    const a = buildPromotionIdempotencyKey('user-1', items);
    const b = buildPromotionIdempotencyKey('user-1', [...items].reverse());
    expect(a).toBe(b);
    expect(a).toMatch(/^charge_promo:user-1:[a-f0-9]{32}$/);
  });

  it('retorna chave diferente para outro usuário ou outro conjunto', () => {
    const base = buildPromotionIdempotencyKey('user-1', items);
    const otherUser = buildPromotionIdempotencyKey('user-2', items);
    const otherSet = buildPromotionIdempotencyKey('user-1', [
      { linkedEntityType: 'boleto', linkedEntityId: 'blt-9' },
    ]);
    expect(otherUser).not.toBe(base);
    expect(otherSet).not.toBe(base);
  });

  it('exige userId', () => {
    expect(() => buildPromotionIdempotencyKey('', items)).toThrow(
      'CHARGE_PROMOTION_IDEMPOTENCY_USER_REQUIRED'
    );
  });
});
