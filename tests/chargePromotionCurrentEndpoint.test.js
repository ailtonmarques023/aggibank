'use strict';

const request = require('supertest');
const app = require('../src/server');
const { prisma } = require('../src/config/database');
const pixSettlementService = require('../src/services/pixSettlementService');

const BEARER = `Bearer ${global.testToken}`;
const ENDPOINT = '/api/charges/promotions/current';

const prevFeature = process.env.FEATURE_CHARGE_PROMOTIONS_ENABLED;
const prevTtl = process.env.CHARGE_PROMOTION_TTL_SECONDS;

function twoOpenChargesMocks() {
  prisma.boleto.findMany.mockResolvedValue([]);
  prisma.loanInsuranceCharge.findMany.mockResolvedValue([
    {
      id: 'lic-1',
      loanId: 'loan-1',
      userId: global.testUser.id,
      amount: 39.0,
      status: 'pendente',
      createdAt: new Date('2026-05-09T14:30:00.000Z'),
      paidAt: null,
      idempotencyKey: null,
    },
  ]);
  prisma.cardShipment.findMany.mockResolvedValue([
    {
      id: 'csh-2',
      cardId: 'card-1',
      userId: global.testUser.id,
      shippingFeeAmount: 40.0,
      shippingFeeStatus: 'PENDENTE',
      status: 'AGUARDANDO_COBRANCA',
      createdAt: new Date('2026-05-10T14:30:00.000Z'),
    },
  ]);
  prisma.boleto.findUnique.mockResolvedValue(null);
}

function mockCreatedPromotion(overrides = {}) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 120_000);
  return {
    id: 'promo-1',
    userId: global.testUser.id,
    idempotencyKey: 'charge_promo:test-user-id:abc:1700000000',
    status: 'ACTIVE',
    discountPercent: 15,
    originalAmountCents: 7900,
    discountAmountCents: 1185,
    promotionalAmountCents: 6715,
    expiresAt,
    notificationSentAt: null,
    emailSentAt: null,
    paidAt: null,
    createdAt: now,
    updatedAt: now,
    items: [
      {
        id: 'item-1',
        promotionId: 'promo-1',
        publicChargeId: 'lic_lic-1',
        publicChargeType: 'loan_insurance',
        linkedEntityType: 'loan_insurance',
        linkedEntityId: 'lic-1',
        originalAmountCents: 3900,
        createdAt: now,
      },
      {
        id: 'item-2',
        promotionId: 'promo-1',
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

describe('GET /api/charges/promotions/current', () => {
  beforeEach(() => {
    prisma.user.findUnique.mockResolvedValue(global.testUser);
    prisma.boleto.findMany.mockResolvedValue([]);
    prisma.loanInsuranceCharge.findMany.mockResolvedValue([]);
    prisma.cardShipment.findMany.mockResolvedValue([]);
    prisma.boleto.findUnique.mockResolvedValue(null);
    prisma.chargePromotion.findUnique.mockResolvedValue(null);
    prisma.chargePromotion.updateMany.mockResolvedValue({ count: 0 });
    prisma.chargePromotion.update.mockResolvedValue({});
    prisma.chargePromotion.create.mockImplementation(async ({ data, include }) => {
      const row = mockCreatedPromotion({
        idempotencyKey: data.idempotencyKey,
        discountPercent: data.discountPercent,
        originalAmountCents: data.originalAmountCents,
        discountAmountCents: data.discountAmountCents,
        promotionalAmountCents: data.promotionalAmountCents,
        expiresAt: data.expiresAt,
        items: (data.items?.create || []).map((it, i) => ({
          id: `item-${i}`,
          promotionId: 'promo-1',
          ...it,
          createdAt: new Date(),
        })),
      });
      return include?.items ? row : row;
    });
    prisma.$transaction.mockImplementation(async (cb) => cb(prisma));
    process.env.FEATURE_CHARGE_PROMOTIONS_ENABLED = 'true';
    process.env.CHARGE_PROMOTION_TTL_SECONDS = '120';
    jest.spyOn(pixSettlementService, 'settlePaidPixCobrancaInTx').mockImplementation(() => {});
  });

  afterEach(() => {
    if (prevFeature !== undefined) process.env.FEATURE_CHARGE_PROMOTIONS_ENABLED = prevFeature;
    else delete process.env.FEATURE_CHARGE_PROMOTIONS_ENABLED;
    if (prevTtl !== undefined) process.env.CHARGE_PROMOTION_TTL_SECONDS = prevTtl;
    else delete process.env.CHARGE_PROMOTION_TTL_SECONDS;
    jest.restoreAllMocks();
  });

  it('com feature flag desligada retorna FEATURE_DISABLED e não persiste', async () => {
    process.env.FEATURE_CHARGE_PROMOTIONS_ENABLED = 'false';
    twoOpenChargesMocks();

    const res = await request(app).get(ENDPOINT).set('Authorization', BEARER).expect(200);

    expect(res.body.data.promotion).toBeNull();
    expect(res.body.data.reason).toBe('FEATURE_DISABLED');
    expect(prisma.chargePromotion.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('com uma cobrança aberta cria promoção com centavos corretos e item', async () => {
    prisma.loanInsuranceCharge.findMany.mockResolvedValue([
      {
        id: 'lic-1',
        loanId: 'loan-1',
        userId: global.testUser.id,
        amount: 39.9,
        status: 'pendente',
        createdAt: new Date(),
        paidAt: null,
      },
    ]);

    const res = await request(app).get(ENDPOINT).set('Authorization', BEARER).expect(200);

    expect(res.body.data.promotion).toMatchObject({
      status: 'ACTIVE',
      discountPercent: 15,
      originalAmountCents: 3990,
      discountAmountCents: 599,
      promotionalAmountCents: 3391,
    });
    expect(res.body.data.promotion.items).toHaveLength(1);
    expect(res.body.data.promotion.items[0]).toMatchObject({
      publicChargeId: 'lic_lic-1',
      publicChargeType: 'loan_insurance',
      linkedEntityType: 'loan_insurance',
      linkedEntityId: 'lic-1',
    });
    expect(prisma.chargePromotion.create).toHaveBeenCalled();
  });

  it('com duas cobranças abertas cria promoção com centavos corretos e items', async () => {
    twoOpenChargesMocks();

    const res = await request(app).get(ENDPOINT).set('Authorization', BEARER).expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.promotion).toMatchObject({
      status: 'ACTIVE',
      discountPercent: 15,
      originalAmountCents: 7900,
      discountAmountCents: 1185,
      promotionalAmountCents: 6715,
    });
    expect(res.body.data.promotion.items).toHaveLength(2);
    expect(res.body.data.promotion.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          publicChargeId: 'lic_lic-1',
          publicChargeType: 'loan_insurance',
          linkedEntityType: 'loan_insurance',
          linkedEntityId: 'lic-1',
        }),
        expect.objectContaining({
          publicChargeId: 'csh_csh-2',
          publicChargeType: 'card_shipping',
          linkedEntityType: 'card_shipment',
          linkedEntityId: 'csh-2',
        }),
      ])
    );
    expect(prisma.chargePromotion.create).toHaveBeenCalled();
  });

  it('segunda chamada na mesma janela reutiliza promoção sem duplicar create', async () => {
    twoOpenChargesMocks();
    const existing = mockCreatedPromotion();
    prisma.chargePromotion.findUnique.mockResolvedValue(existing);

    const res = await request(app).get(ENDPOINT).set('Authorization', BEARER).expect(200);

    expect(res.body.data.promotion.id).toBe('promo-1');
    expect(prisma.chargePromotion.create).not.toHaveBeenCalled();
  });

  it('promoção ACTIVE expirada é marcada EXPIRED e nova pode ser criada', async () => {
    twoOpenChargesMocks();
    const expired = mockCreatedPromotion({
      expiresAt: new Date('2020-01-01T00:00:00.000Z'),
    });
    prisma.chargePromotion.findUnique
      .mockResolvedValueOnce(expired)
      .mockResolvedValueOnce(null);

    const res = await request(app).get(ENDPOINT).set('Authorization', BEARER).expect(200);

    expect(prisma.chargePromotion.update).toHaveBeenCalledWith({
      where: { id: 'promo-1' },
      data: { status: 'EXPIRED' },
    });
    expect(res.body.data.promotion).toBeTruthy();
    expect(prisma.chargePromotion.create).toHaveBeenCalled();
  });

  it('não confunde rota com GET /api/charges/:id', async () => {
    process.env.FEATURE_CHARGE_PROMOTIONS_ENABLED = 'false';
    const res = await request(app).get(ENDPOINT).set('Authorization', BEARER).expect(200);
    expect(res.status).not.toBe(404);
    expect(res.body.code).not.toBe('CHARGE_NOT_FOUND');
  });

  it('não aciona Pix, settlement, ledger ou saldo', async () => {
    twoOpenChargesMocks();
    await request(app).get(ENDPOINT).set('Authorization', BEARER).expect(200);

    expect(prisma.pixCobranca.create).not.toHaveBeenCalled();
    expect(prisma.movimentacao.create).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(pixSettlementService.settlePaidPixCobrancaInTx).not.toHaveBeenCalled();
  });
});
