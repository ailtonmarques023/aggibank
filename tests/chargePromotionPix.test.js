'use strict';

const request = require('supertest');
const app = require('../src/server');
const { prisma } = require('../src/config/database');
const pixPromotionSvc = require('../src/services/pixCobrancaPromotionEfiService');
const pixSettlementService = require('../src/services/pixSettlementService');
const efiPixClient = require('../src/services/efiPixClient');

const BEARER = `Bearer ${global.testToken}`;
const PROMO_ID = 'promo-test-1';

const prevPromo = process.env.FEATURE_CHARGE_PROMOTIONS_ENABLED;
const prevPix = process.env.FEATURE_CHARGE_PROMOTION_PIX_ENABLED;

function activePromotion(overrides = {}) {
  const now = new Date();
  return {
    id: PROMO_ID,
    userId: global.testUser.id,
    idempotencyKey: 'charge_promo:test:abc:1',
    status: 'ACTIVE',
    discountPercent: 15,
    originalAmountCents: 7900,
    discountAmountCents: 1185,
    promotionalAmountCents: 6715,
    expiresAt: new Date(now.getTime() + 120_000),
    notificationSentAt: null,
    emailSentAt: null,
    paidAt: null,
    createdAt: now,
    updatedAt: now,
    items: [
      {
        id: 'pi-1',
        promotionId: PROMO_ID,
        publicChargeId: 'lic_lic-1',
        publicChargeType: 'loan_insurance',
        linkedEntityType: 'loan_insurance',
        linkedEntityId: 'lic-1',
        originalAmountCents: 3900,
        createdAt: now,
      },
      {
        id: 'pi-2',
        promotionId: PROMO_ID,
        publicChargeId: 'csh_csh-2',
        publicChargeType: 'card_shipping',
        linkedEntityType: 'card_shipment',
        linkedEntityId: 'csh-2',
        originalAmountCents: 4000,
        createdAt: now,
      },
    ],
    ...overrides,
  };
}

function mockItemsPayable() {
  prisma.loanInsuranceCharge.findFirst.mockResolvedValue({
    id: 'lic-1',
    userId: global.testUser.id,
    status: 'pendente',
  });
  prisma.cardShipment.findFirst.mockResolvedValue({
    id: 'csh-2',
    userId: global.testUser.id,
    shippingFeeStatus: 'PENDENTE',
  });
}

describe('POST /api/charges/promotions/:promotionId/pix', () => {
  let pixSpy;

  beforeEach(() => {
    prisma.user.findUnique.mockResolvedValue(global.testUser);
    process.env.FEATURE_CHARGE_PROMOTIONS_ENABLED = 'true';
    process.env.FEATURE_CHARGE_PROMOTION_PIX_ENABLED = 'true';
    jest.spyOn(pixPromotionSvc, 'isEfiPixConfigured').mockReturnValue(true);
    pixSpy = jest.spyOn(pixPromotionSvc, 'getOrCreateEfiPixForChargePromotion').mockResolvedValue({
      pixMode: 'copiaecola',
      pixCopiaECola: '000201PROMO',
      qrCodePix: null,
      amount: 67.15,
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      txid: 'txidPromoUnit01',
      provider: 'EFI',
      promotionId: PROMO_ID,
      providerReference: '99',
      pixStatus: 'ATIVA',
      source: 'efi',
    });
    jest.spyOn(pixSettlementService, 'settlePaidPixCobrancaInTx').mockResolvedValue({
      settlementResult: 'PROMOTION_SETTLEMENT_PENDING',
    });
    prisma.pixCobranca.findFirst.mockResolvedValue(null);
  });

  afterEach(() => {
    if (prevPromo !== undefined) process.env.FEATURE_CHARGE_PROMOTIONS_ENABLED = prevPromo;
    else delete process.env.FEATURE_CHARGE_PROMOTIONS_ENABLED;
    if (prevPix !== undefined) process.env.FEATURE_CHARGE_PROMOTION_PIX_ENABLED = prevPix;
    else delete process.env.FEATURE_CHARGE_PROMOTION_PIX_ENABLED;
    jest.restoreAllMocks();
  });

  it('FEATURE_CHARGE_PROMOTIONS_ENABLED desligada retorna FEATURE_DISABLED', async () => {
    process.env.FEATURE_CHARGE_PROMOTIONS_ENABLED = 'false';
    const res = await request(app)
      .post(`/api/charges/promotions/${PROMO_ID}/pix`)
      .set('Authorization', BEARER)
      .send({})
      .expect(503);
    expect(res.body.code).toBe('FEATURE_DISABLED');
    expect(pixSpy).not.toHaveBeenCalled();
    expect(prisma.pixCobranca.create).not.toHaveBeenCalled();
  });

  it('FEATURE_CHARGE_PROMOTION_PIX_ENABLED desligada retorna PROMOTION_PIX_DISABLED', async () => {
    process.env.FEATURE_CHARGE_PROMOTION_PIX_ENABLED = 'false';
    const res = await request(app)
      .post(`/api/charges/promotions/${PROMO_ID}/pix`)
      .set('Authorization', BEARER)
      .send({})
      .expect(503);
    expect(res.body.code).toBe('PROMOTION_PIX_DISABLED');
    expect(pixSpy).not.toHaveBeenCalled();
  });

  it('promoção inexistente retorna 404 PROMOTION_NOT_FOUND', async () => {
    prisma.chargePromotion.findFirst.mockResolvedValue(null);
    const res = await request(app)
      .post('/api/charges/promotions/inexistente/pix')
      .set('Authorization', BEARER)
      .send({})
      .expect(404);
    expect(res.body.code).toBe('PROMOTION_NOT_FOUND');
  });

  it('promoção de outro usuário retorna 404 PROMOTION_NOT_FOUND', async () => {
    prisma.chargePromotion.findFirst.mockResolvedValue(null);
    const res = await request(app)
      .post(`/api/charges/promotions/${PROMO_ID}/pix`)
      .set('Authorization', BEARER)
      .send({})
      .expect(404);
    expect(res.body.code).toBe('PROMOTION_NOT_FOUND');
  });

  it('promoção expirada retorna 410 PROMOTION_EXPIRED', async () => {
    prisma.chargePromotion.findFirst.mockResolvedValue(
      activePromotion({ expiresAt: new Date('2020-01-01T00:00:00.000Z') })
    );
    prisma.chargePromotion.update.mockResolvedValue({});
    const res = await request(app)
      .post(`/api/charges/promotions/${PROMO_ID}/pix`)
      .set('Authorization', BEARER)
      .send({})
      .expect(410);
    expect(res.body.code).toBe('PROMOTION_EXPIRED');
    expect(pixSpy).not.toHaveBeenCalled();
  });

  it('promoção não ACTIVE retorna PROMOTION_NOT_ACTIVE', async () => {
    prisma.chargePromotion.findFirst.mockResolvedValue(activePromotion({ status: 'EXPIRED' }));
    const res = await request(app)
      .post(`/api/charges/promotions/${PROMO_ID}/pix`)
      .set('Authorization', BEARER)
      .send({})
      .expect(400);
    expect(res.body.code).toBe('PROMOTION_NOT_ACTIVE');
  });

  it('promoção ACTIVE elegível emite Pix com amount do backend', async () => {
    prisma.chargePromotion.findFirst.mockResolvedValue(activePromotion());
    mockItemsPayable();

    const res = await request(app)
      .post(`/api/charges/promotions/${PROMO_ID}/pix`)
      .set('Authorization', BEARER)
      .send({ amount: 1 })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.amount).toBe(67.15);
    expect(res.body.data.promotionId).toBe(PROMO_ID);
    expect(pixSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: global.testUser.id,
        promotionId: PROMO_ID,
        promotionalAmountCents: 6715,
      })
    );
  });

  it('Pix PAGA existente retorna PROMOTION_PIX_ALREADY_PAID', async () => {
    prisma.chargePromotion.findFirst.mockResolvedValue(activePromotion());
    mockItemsPayable();
    prisma.pixCobranca.findFirst.mockResolvedValue({
      id: 'pc-paid',
      status: 'PAGA',
      linkedEntityType: 'charge_promotion',
      linkedEntityId: PROMO_ID,
    });

    const res = await request(app)
      .post(`/api/charges/promotions/${PROMO_ID}/pix`)
      .set('Authorization', BEARER)
      .send({})
      .expect(409);
    expect(res.body.code).toBe('PROMOTION_PIX_ALREADY_PAID');
    expect(pixSpy).not.toHaveBeenCalled();
  });

  it('não chama settlement, ledger ou altera cobranças', async () => {
    prisma.chargePromotion.findFirst.mockResolvedValue(activePromotion());
    mockItemsPayable();
    await request(app)
      .post(`/api/charges/promotions/${PROMO_ID}/pix`)
      .set('Authorization', BEARER)
      .send({})
      .expect(200);

    expect(pixSettlementService.settlePaidPixCobrancaInTx).not.toHaveBeenCalled();
    expect(prisma.movimentacao.create).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.loanInsuranceCharge.update).not.toHaveBeenCalled();
    expect(prisma.cardShipment.update).not.toHaveBeenCalled();
    expect(prisma.boleto.update).not.toHaveBeenCalled();
    expect(prisma.chargePromotion.update).not.toHaveBeenCalled();
  });
});
