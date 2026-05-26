'use strict';

const request = require('supertest');
const app = require('../src/server');
const { prisma } = require('../src/config/database');
const pixSvc = require('../src/services/pixCobrancaEfiService');
const {
  findBlockingPromotionForIndividualPix,
  evaluatePromotionalPixBlocking,
  linkageFromParsedCharge,
  isBlockIndividualPixWhenPromotionActiveEnabled,
} = require('../src/services/chargePromotionIndividualPixBlockService');

const BEARER = `Bearer ${global.testToken}`;

const prevBlockFlag = process.env.FEATURE_BLOCK_INDIVIDUAL_PIX_WHEN_PROMOTION_ACTIVE;
const prevEfi = {
  id: process.env.EFI_CLIENT_ID,
  sec: process.env.EFI_CLIENT_SECRET,
  key: process.env.EFI_PIX_KEY,
  b64: process.env.EFI_CERTIFICATE_BASE64,
};

function futureDate() {
  return new Date(Date.now() + 60 * 60 * 1000);
}

function pastDate() {
  return new Date(Date.now() - 60 * 60 * 1000);
}

/**
 * @param {Array<{ promotion: object, pixRows?: object[] }>} entries
 */
function mockPromotionCandidates(entries) {
  const candidates = entries.map((entry, index) => ({
    id: `item-${index}`,
    promotionId: entry.promotion.id,
    linkedEntityType: 'loan_insurance',
    linkedEntityId: 'charge-lic-1',
    promotion: entry.promotion,
  }));
  prisma.chargePromotionItem.findMany.mockResolvedValue(candidates);
  prisma.pixCobranca.findMany.mockImplementation(async (args) => {
    const promotionId = args?.where?.linkedEntityId;
    const match = entries.find((e) => e.promotion.id === promotionId);
    return match?.pixRows ?? [];
  });
}

function mockPromotionItem(promotionOverrides = {}, pixRows = []) {
  mockPromotionCandidates([
    {
      promotion: {
        id: 'promo-1',
        status: 'ACTIVE',
        expiresAt: futureDate(),
        ...promotionOverrides,
      },
      pixRows,
    },
  ]);
}

describe('chargePromotionIndividualPixBlockService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.FEATURE_BLOCK_INDIVIDUAL_PIX_WHEN_PROMOTION_ACTIVE = 'true';
  });

  afterAll(() => {
    if (prevBlockFlag !== undefined) {
      process.env.FEATURE_BLOCK_INDIVIDUAL_PIX_WHEN_PROMOTION_ACTIVE = prevBlockFlag;
    } else {
      delete process.env.FEATURE_BLOCK_INDIVIDUAL_PIX_WHEN_PROMOTION_ACTIVE;
    }
  });

  it('flag desligada retorna blocked false sem consultar promoção', async () => {
    process.env.FEATURE_BLOCK_INDIVIDUAL_PIX_WHEN_PROMOTION_ACTIVE = 'false';
    const r = await findBlockingPromotionForIndividualPix({
      userId: global.testUser.id,
      publicChargeId: 'lic_charge-lic-1',
      publicChargeType: 'loan_insurance',
      linkedEntityType: 'loan_insurance',
      linkedEntityId: 'charge-lic-1',
    });
    expect(r.blocked).toBe(false);
    expect(prisma.chargePromotionItem.findMany).not.toHaveBeenCalled();
  });

  it('sem item de promoção: blocked false', async () => {
    prisma.chargePromotionItem.findMany.mockResolvedValue([]);
    const r = await findBlockingPromotionForIndividualPix({
      userId: global.testUser.id,
      publicChargeId: 'lic_charge-lic-1',
      publicChargeType: 'loan_insurance',
      linkedEntityType: 'loan_insurance',
      linkedEntityId: 'charge-lic-1',
    });
    expect(r.blocked).toBe(false);
  });

  it('promo ACTIVE sem Pix promocional: blocked false', async () => {
    mockPromotionItem({ status: 'ACTIVE' }, []);
    const r = await findBlockingPromotionForIndividualPix({
      userId: global.testUser.id,
      publicChargeId: 'lic_charge-lic-1',
      publicChargeType: 'loan_insurance',
      linkedEntityType: 'loan_insurance',
      linkedEntityId: 'charge-lic-1',
    });
    expect(r.blocked).toBe(false);
  });

  it('Pix promocional ATIVA não expirado: blocked true PROMOTION_PIX_ACTIVE', async () => {
    mockPromotionItem(
      { status: 'ACTIVE' },
      [
        {
          id: 'pix-promo-1',
          status: 'ATIVA',
          expiresAt: futureDate(),
        },
      ],
    );
    const r = await findBlockingPromotionForIndividualPix({
      userId: global.testUser.id,
      publicChargeId: 'lic_charge-lic-1',
      publicChargeType: 'loan_insurance',
      linkedEntityType: 'loan_insurance',
      linkedEntityId: 'charge-lic-1',
    });
    expect(r.blocked).toBe(true);
    expect(r.reason).toBe('PROMOTION_PIX_ACTIVE');
    expect(r.promotionId).toBe('promo-1');
    expect(r.pixCobrancaId).toBe('pix-promo-1');
  });

  it('Pix promocional PAGA: blocked true PROMOTION_PIX_PAID', async () => {
    mockPromotionItem(
      { status: 'ACTIVE' },
      [{ id: 'pix-paid', status: 'PAGA', expiresAt: null }],
    );
    const r = await findBlockingPromotionForIndividualPix({
      userId: global.testUser.id,
      publicChargeId: 'lic_charge-lic-1',
      publicChargeType: 'loan_insurance',
      linkedEntityType: 'loan_insurance',
      linkedEntityId: 'charge-lic-1',
    });
    expect(r.blocked).toBe(true);
    expect(r.reason).toBe('PROMOTION_PIX_PAID');
  });

  it('Pix promocional CONCILIADA: blocked true', async () => {
    mockPromotionItem(
      { status: 'EXPIRED' },
      [{ id: 'pix-conc', status: 'CONCILIADA', expiresAt: pastDate() }],
    );
    const r = await findBlockingPromotionForIndividualPix({
      userId: global.testUser.id,
      publicChargeId: 'lic_charge-lic-1',
      publicChargeType: 'loan_insurance',
      linkedEntityType: 'loan_insurance',
      linkedEntityId: 'charge-lic-1',
    });
    expect(r.blocked).toBe(true);
    expect(r.reason).toBe('PROMOTION_PIX_PAID');
  });

  it('Pix promocional LIQUIDADA: blocked true', async () => {
    expect(
      evaluatePromotionalPixBlocking({ status: 'LIQUIDADA' }, new Date()).blocking,
    ).toBe(true);
  });

  it('promo EXPIRED com Pix ATIVA expirado: blocked false', async () => {
    mockPromotionItem(
      { status: 'EXPIRED' },
      [{ id: 'pix-old', status: 'ATIVA', expiresAt: pastDate() }],
    );
    const r = await findBlockingPromotionForIndividualPix({
      userId: global.testUser.id,
      publicChargeId: 'lic_charge-lic-1',
      publicChargeType: 'loan_insurance',
      linkedEntityType: 'loan_insurance',
      linkedEntityId: 'charge-lic-1',
    });
    expect(r.blocked).toBe(false);
  });

  it('promo EXPIRED com Pix PAGA: blocked true', async () => {
    mockPromotionItem(
      { status: 'EXPIRED' },
      [{ id: 'pix-paid-exp', status: 'PAGA', expiresAt: pastDate() }],
    );
    const r = await findBlockingPromotionForIndividualPix({
      userId: global.testUser.id,
      publicChargeId: 'lic_charge-lic-1',
      publicChargeType: 'loan_insurance',
      linkedEntityType: 'loan_insurance',
      linkedEntityId: 'charge-lic-1',
    });
    expect(r.blocked).toBe(true);
  });

  it('duas promoções candidatas: primeira sem Pix relevante, segunda com PAGA bloqueia', async () => {
    mockPromotionCandidates([
      {
        promotion: {
          id: 'promo-old',
          status: 'EXPIRED',
          expiresAt: pastDate(),
        },
        pixRows: [{ id: 'pix-stale', status: 'ATIVA', expiresAt: pastDate() }],
      },
      {
        promotion: {
          id: 'promo-new',
          status: 'ACTIVE',
          expiresAt: futureDate(),
        },
        pixRows: [{ id: 'pix-paid-new', status: 'PAGA', expiresAt: null }],
      },
    ]);

    const r = await findBlockingPromotionForIndividualPix({
      userId: global.testUser.id,
      publicChargeId: 'lic_charge-lic-1',
      publicChargeType: 'loan_insurance',
      linkedEntityType: 'loan_insurance',
      linkedEntityId: 'charge-lic-1',
    });

    expect(r.blocked).toBe(true);
    expect(r.reason).toBe('PROMOTION_PIX_PAID');
    expect(r.promotionId).toBe('promo-new');
    expect(r.pixCobrancaId).toBe('pix-paid-new');
    expect(prisma.chargePromotionItem.findMany).toHaveBeenCalled();
    expect(prisma.pixCobranca.findMany).toHaveBeenCalledTimes(2);
  });

  it('duas promoções candidatas: só a segunda com ATIVA não expirada bloqueia', async () => {
    mockPromotionCandidates([
      {
        promotion: { id: 'promo-a', status: 'ACTIVE', expiresAt: futureDate() },
        pixRows: [],
      },
      {
        promotion: { id: 'promo-b', status: 'EXPIRED', expiresAt: pastDate() },
        pixRows: [
          { id: 'pix-active-b', status: 'ATIVA', expiresAt: futureDate() },
        ],
      },
    ]);

    const r = await findBlockingPromotionForIndividualPix({
      userId: global.testUser.id,
      publicChargeId: 'lic_charge-lic-1',
      publicChargeType: 'loan_insurance',
      linkedEntityType: 'loan_insurance',
      linkedEntityId: 'charge-lic-1',
    });

    expect(r.blocked).toBe(true);
    expect(r.reason).toBe('PROMOTION_PIX_ACTIVE');
    expect(r.promotionId).toBe('promo-b');
    expect(r.pixCobrancaId).toBe('pix-active-b');
  });

  it('linkageFromParsedCharge mapeia tipos', () => {
    expect(linkageFromParsedCharge('lic_x', { kind: 'loan_insurance', id: 'x' })).toEqual({
      publicChargeId: 'lic_x',
      publicChargeType: 'loan_insurance',
      linkedEntityType: 'loan_insurance',
      linkedEntityId: 'x',
    });
    expect(linkageFromParsedCharge('blt_y', { kind: 'boleto', id: 'y' })).toMatchObject({
      publicChargeType: 'gru_boleto',
      linkedEntityType: 'boleto',
    });
    expect(linkageFromParsedCharge('csh_z', { kind: 'card_shipment', id: 'z' })).toMatchObject({
      publicChargeType: 'card_shipping',
      linkedEntityType: 'card_shipment',
    });
  });
});

describe('POST /api/charges/:id/pix — bloqueio Fatia 5', () => {
  let efiSpy;

  beforeEach(() => {
    prisma.user.findUnique.mockResolvedValue(global.testUser);
    prisma.loanInsuranceCharge.findFirst.mockResolvedValue({
      id: 'charge-lic-1',
      loanId: 'loan-1',
      userId: global.testUser.id,
      amount: 39.9,
      status: 'pendente',
      createdAt: new Date(),
      paidAt: null,
      idempotencyKey: null,
    });
    prisma.chargePromotionItem.findMany.mockResolvedValue([]);
    prisma.pixCobranca.findMany.mockResolvedValue([]);

    delete process.env.PIX_RECEIVER_KEY;
    process.env.EFI_ENVIRONMENT = 'sandbox';
    process.env.EFI_CLIENT_ID = 'efi-test-client';
    process.env.EFI_CLIENT_SECRET = 'efi-test-secret';
    process.env.EFI_PIX_KEY = 'efipay-dev-key';
    process.env.EFI_CERTIFICATE_BASE64 = Buffer.from('fake-p12').toString('base64');

    efiSpy = jest.spyOn(pixSvc, 'getOrCreateEfiPixForCharge').mockResolvedValue({
      pixMode: 'copiaecola',
      pixCopiaECola: '00020101021226840014BR.GOV.BCB.PIX',
      amount: 39.9,
      txid: 'txidIndividualBlockTest01',
      pixStatus: 'ATIVA',
      source: 'efi',
      provider: 'EFI',
    });
  });

  afterEach(() => {
    efiSpy.mockRestore();
    if (prevBlockFlag !== undefined) {
      process.env.FEATURE_BLOCK_INDIVIDUAL_PIX_WHEN_PROMOTION_ACTIVE = prevBlockFlag;
    } else {
      delete process.env.FEATURE_BLOCK_INDIVIDUAL_PIX_WHEN_PROMOTION_ACTIVE;
    }
    if (prevEfi.id !== undefined) process.env.EFI_CLIENT_ID = prevEfi.id;
    else delete process.env.EFI_CLIENT_ID;
    if (prevEfi.sec !== undefined) process.env.EFI_CLIENT_SECRET = prevEfi.sec;
    else delete process.env.EFI_CLIENT_SECRET;
    if (prevEfi.key !== undefined) process.env.EFI_PIX_KEY = prevEfi.key;
    else delete process.env.EFI_PIX_KEY;
    if (prevEfi.b64 !== undefined) process.env.EFI_CERTIFICATE_BASE64 = prevEfi.b64;
    else delete process.env.EFI_CERTIFICATE_BASE64;
  });

  it('flag desligada: Pix individual segue com Efí', async () => {
    process.env.FEATURE_BLOCK_INDIVIDUAL_PIX_WHEN_PROMOTION_ACTIVE = 'false';
    mockPromotionItem(
      { status: 'ACTIVE' },
      [{ id: 'pix-promo', status: 'ATIVA', expiresAt: futureDate() }],
    );

    const res = await request(app)
      .post('/api/charges/lic_charge-lic-1/pix')
      .set('Authorization', BEARER)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(efiSpy).toHaveBeenCalled();
    expect(prisma.chargePromotionItem.findMany).not.toHaveBeenCalled();
  });

  it('flag ligada sem promoção: Pix individual OK', async () => {
    process.env.FEATURE_BLOCK_INDIVIDUAL_PIX_WHEN_PROMOTION_ACTIVE = 'true';
    prisma.chargePromotionItem.findMany.mockResolvedValue([]);

    await request(app)
      .post('/api/charges/lic_charge-lic-1/pix')
      .set('Authorization', BEARER)
      .expect(200);

    expect(efiSpy).toHaveBeenCalled();
  });

  it('flag ligada promo ACTIVE sem Pix promocional: Pix individual OK', async () => {
    process.env.FEATURE_BLOCK_INDIVIDUAL_PIX_WHEN_PROMOTION_ACTIVE = 'true';
    mockPromotionItem({ status: 'ACTIVE' }, []);

    await request(app)
      .post('/api/charges/lic_charge-lic-1/pix')
      .set('Authorization', BEARER)
      .expect(200);

    expect(efiSpy).toHaveBeenCalled();
  });

  it('flag ligada com Pix promocional ATIVA: 409 CHARGE_IN_ACTIVE_PROMOTION', async () => {
    process.env.FEATURE_BLOCK_INDIVIDUAL_PIX_WHEN_PROMOTION_ACTIVE = 'true';
    mockPromotionItem(
      { status: 'ACTIVE' },
      [{ id: 'pix-promo-active', status: 'ATIVA', expiresAt: futureDate() }],
    );

    const res = await request(app)
      .post('/api/charges/lic_charge-lic-1/pix')
      .set('Authorization', BEARER)
      .expect(409);

    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('CHARGE_IN_ACTIVE_PROMOTION');
    expect(res.body.data.promotionId).toBe('promo-1');
    expect(res.body.data.reason).toBe('PROMOTION_PIX_ACTIVE');
    expect(efiSpy).not.toHaveBeenCalled();
    expect(prisma.pixCobranca.create).not.toHaveBeenCalled();
  });

  it('flag ligada com Pix promocional PAGA: 409', async () => {
    process.env.FEATURE_BLOCK_INDIVIDUAL_PIX_WHEN_PROMOTION_ACTIVE = 'true';
    mockPromotionItem(
      { status: 'ACTIVE' },
      [{ id: 'pix-promo-paid', status: 'PAGA', expiresAt: null }],
    );

    const res = await request(app)
      .post('/api/charges/lic_charge-lic-1/pix')
      .set('Authorization', BEARER)
      .expect(409);

    expect(res.body.data.reason).toBe('PROMOTION_PIX_PAID');
    expect(efiSpy).not.toHaveBeenCalled();
  });

  it('flag ligada promo EXPIRED Pix expirado: Pix individual OK', async () => {
    process.env.FEATURE_BLOCK_INDIVIDUAL_PIX_WHEN_PROMOTION_ACTIVE = 'true';
    mockPromotionItem(
      { status: 'EXPIRED' },
      [{ id: 'pix-stale', status: 'ATIVA', expiresAt: pastDate() }],
    );

    await request(app)
      .post('/api/charges/lic_charge-lic-1/pix')
      .set('Authorization', BEARER)
      .expect(200);

    expect(efiSpy).toHaveBeenCalled();
  });

  it('boleto bloqueado quando item na promoção', async () => {
    process.env.FEATURE_BLOCK_INDIVIDUAL_PIX_WHEN_PROMOTION_ACTIVE = 'true';
    prisma.boleto.findFirst.mockResolvedValue({
      id: 'bol-1',
      userId: global.testUser.id,
      valor: 50,
      status: 'pendente',
      descricao: 'GRU',
      createdAt: new Date(),
    });
    prisma.loanInsuranceCharge.findFirst.mockResolvedValue(null);
    prisma.chargePromotionItem.findMany.mockResolvedValue([
      {
        linkedEntityType: 'boleto',
        linkedEntityId: 'bol-1',
        promotion: { id: 'promo-blt', status: 'ACTIVE', expiresAt: futureDate() },
      },
    ]);
    prisma.pixCobranca.findMany.mockResolvedValue([
      { id: 'pix-blt', status: 'CRIADA', expiresAt: futureDate() },
    ]);

    const res = await request(app)
      .post('/api/charges/blt_bol-1/pix')
      .set('Authorization', BEARER)
      .expect(409);

    expect(res.body.error).toBe('CHARGE_IN_ACTIVE_PROMOTION');
    expect(efiSpy).not.toHaveBeenCalled();
  });

  it('card_shipment bloqueado quando item na promoção', async () => {
    process.env.FEATURE_BLOCK_INDIVIDUAL_PIX_WHEN_PROMOTION_ACTIVE = 'true';
    prisma.cardShipment.findFirst.mockResolvedValue({
      id: 'ship-1',
      userId: global.testUser.id,
      shippingFeeAmount: 25,
      shippingFeeStatus: 'PENDENTE',
      status: 'AGUARDANDO_COBRANCA',
      createdAt: new Date(),
    });
    prisma.loanInsuranceCharge.findFirst.mockResolvedValue(null);
    prisma.chargePromotionItem.findMany.mockResolvedValue([
      {
        linkedEntityType: 'card_shipment',
        linkedEntityId: 'ship-1',
        promotion: { id: 'promo-ship', status: 'ACTIVE', expiresAt: futureDate() },
      },
    ]);
    prisma.pixCobranca.findMany.mockResolvedValue([
      { id: 'pix-ship', status: 'ATIVA', expiresAt: futureDate() },
    ]);

    await request(app)
      .post('/api/charges/csh_ship-1/pix')
      .set('Authorization', BEARER)
      .expect(409);

    expect(efiSpy).not.toHaveBeenCalled();
  });

  it('não altera saldo nem cria ledger', async () => {
    process.env.FEATURE_BLOCK_INDIVIDUAL_PIX_WHEN_PROMOTION_ACTIVE = 'true';
    mockPromotionItem(
      { status: 'ACTIVE' },
      [{ id: 'pix-block', status: 'ATIVA', expiresAt: futureDate() }],
    );

    await request(app)
      .post('/api/charges/lic_charge-lic-1/pix')
      .set('Authorization', BEARER)
      .expect(409);

    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.movimentacao.create).not.toHaveBeenCalled();
    expect(prisma.chargePromotion.update).not.toHaveBeenCalled();
    expect(prisma.chargePromotion.updateMany).not.toHaveBeenCalled();
  });
});

describe('isBlockIndividualPixWhenPromotionActiveEnabled', () => {
  it('lê env corretamente', () => {
    process.env.FEATURE_BLOCK_INDIVIDUAL_PIX_WHEN_PROMOTION_ACTIVE = 'true';
    expect(isBlockIndividualPixWhenPromotionActiveEnabled()).toBe(true);
    process.env.FEATURE_BLOCK_INDIVIDUAL_PIX_WHEN_PROMOTION_ACTIVE = 'false';
    expect(isBlockIndividualPixWhenPromotionActiveEnabled()).toBe(false);
  });
});
