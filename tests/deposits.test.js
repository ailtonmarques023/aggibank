'use strict';

const request = require('supertest');
const app = require('../src/server');
const { prisma } = require('../src/config/database');
const pixProviderService = require('../src/services/pix/pixProviderService');

const BEARER = `Bearer ${global.testToken}`;

describe('POST /api/deposits/pix', () => {
  let spyConfigured;
  let spyCreatePix;

  beforeEach(() => {
    prisma.user.findUnique.mockResolvedValue(global.testUser);
    spyConfigured = jest.spyOn(pixProviderService, 'isPixChargeProviderConfigured').mockReturnValue(true);
    spyCreatePix = jest.spyOn(pixProviderService, 'createOrGetPixChargeForCharge').mockResolvedValue({
      pixMode: 'copiaecola',
      pixCopiaECola: '00020101021226840014BR.GOV.BCB.PIX2564DEP',
      pixKey: null,
      amount: 50,
      instructions: 'Utilize o código Pix abaixo para realizar o pagamento.',
      txid: 'txidDepositUnitTest0000000001',
      providerReference: '77',
      qrCodePix: null,
      expiresAt: new Date('2026-12-31T23:59:59.000Z').toISOString(),
      paidAt: null,
      pixStatus: 'ATIVA',
      source: 'efi',
      provider: 'EFI',
    });
    prisma.accountDeposit.create.mockResolvedValue({
      id: 'dep-unit-1',
      userId: global.testUser.id,
      amount: 50,
      status: 'PENDENTE',
      provider: 'EFI',
      pixCobrancaId: null,
      creditedMovementId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      paidAt: null,
      creditedAt: null,
    });
    prisma.pixCobranca.findFirst.mockResolvedValue({
      id: 'pc-dep-1',
      userId: global.testUser.id,
      linkedEntityType: 'account_deposit',
      linkedEntityId: 'dep-unit-1',
      amount: 50,
      status: 'ATIVA',
      txid: 'txidDepositUnitTest0000000001',
      providerReference: '77',
      pixCopiaECola: '00020101021226840014BR.GOV.BCB.PIX2564DEP',
      qrCodePix: null,
      expiresAt: new Date('2026-12-31T23:59:59.000Z'),
      paidAt: null,
      idempotencyKey: 'k-dep',
      provider: 'EFI',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    prisma.accountDeposit.update.mockResolvedValue({
      id: 'dep-unit-1',
      userId: global.testUser.id,
      amount: 50,
      status: 'PIX_GERADO',
      provider: 'EFI',
      pixCobrancaId: 'pc-dep-1',
      creditedMovementId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      paidAt: null,
      creditedAt: null,
      pixCobranca: {
        id: 'pc-dep-1',
        txid: 'txidDepositUnitTest0000000001',
        status: 'ATIVA',
        amount: 50,
        expiresAt: new Date('2026-12-31T23:59:59.000Z'),
        paidAt: null,
        provider: 'EFI',
      },
    });
  });

  afterEach(() => {
    spyConfigured.mockRestore();
    spyCreatePix.mockRestore();
  });

  it('201 cria depósito e retorna Pix', async () => {
    const res = await request(app)
      .post('/api/deposits/pix')
      .set('Authorization', BEARER)
      .send({ amount: 50 })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.deposit.status).toBe('PIX_GERADO');
    expect(res.body.data.deposit.amount).toBe(50);
    expect(res.body.data.pix.txid).toBe('txidDepositUnitTest0000000001');
    expect(pixProviderService.createOrGetPixChargeForCharge).toHaveBeenCalledWith(
      expect.objectContaining({
        chargeKind: 'account_deposit',
        amount: 50,
        userId: global.testUser.id,
      }),
    );
  });

  it('400 INVALID_AMOUNT para valor inválido', async () => {
    const res = await request(app)
      .post('/api/deposits/pix')
      .set('Authorization', BEARER)
      .send({ amount: '10.999' })
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('INVALID_AMOUNT');
    expect(prisma.accountDeposit.create).not.toHaveBeenCalled();
  });

  it('503 quando provedor Pix não configurado', async () => {
    pixProviderService.isPixChargeProviderConfigured.mockReturnValue(false);
    const res = await request(app)
      .post('/api/deposits/pix')
      .set('Authorization', BEARER)
      .send({ amount: 20 })
      .expect(503);

    expect(res.body.code).toBe('PIX_PROVIDER_UNAVAILABLE');
    expect(prisma.accountDeposit.create).not.toHaveBeenCalled();
  });

  it('401 sem token', async () => {
    await request(app).post('/api/deposits/pix').send({ amount: 10 }).expect(401);
  });
});

describe('GET /api/deposits', () => {
  beforeEach(() => {
    prisma.user.findUnique.mockResolvedValue(global.testUser);
    prisma.accountDeposit.findMany.mockResolvedValue([
      {
        id: 'd1',
        userId: global.testUser.id,
        amount: 25,
        status: 'CREDITADO',
        provider: 'EFI',
        pixCobrancaId: 'p1',
        creditedMovementId: 'm1',
        createdAt: new Date('2026-05-10T10:00:00.000Z'),
        updatedAt: new Date('2026-05-10T10:05:00.000Z'),
        paidAt: new Date('2026-05-10T10:04:00.000Z'),
        creditedAt: new Date('2026-05-10T10:05:00.000Z'),
      },
    ]);
  });

  it('200 lista depósitos do titular', async () => {
    const res = await request(app).get('/api/deposits').set('Authorization', BEARER).expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.deposits.length).toBe(1);
    expect(res.body.data.deposits[0].id).toBe('d1');
  });
});

describe('GET /api/deposits/:id', () => {
  beforeEach(() => {
    prisma.user.findUnique.mockResolvedValue(global.testUser);
  });

  it('404 quando não existe', async () => {
    prisma.accountDeposit.findFirst.mockResolvedValue(null);
    await request(app).get('/api/deposits/nao-existe').set('Authorization', BEARER).expect(404);
  });

  it('200 retorna depósito com Pix resumido quando CREDITADO', async () => {
    prisma.accountDeposit.findFirst.mockResolvedValue({
      id: 'd1',
      userId: global.testUser.id,
      amount: 25,
      status: 'CREDITADO',
      provider: 'EFI',
      pixCobrancaId: 'p1',
      creditedMovementId: 'm1',
      createdAt: new Date(),
      updatedAt: new Date(),
      paidAt: new Date(),
      creditedAt: new Date(),
      pixCobranca: {
        id: 'p1',
        txid: 'tx1',
        status: 'PAGA',
        amount: 25,
        expiresAt: new Date(),
        paidAt: new Date(),
        provider: 'EFI',
        pixCopiaECola: 'SECRET_BR_CODE',
        qrCodePix: null,
      },
    });

    const res = await request(app).get('/api/deposits/d1').set('Authorization', BEARER).expect(200);
    expect(res.body.data.deposit.status).toBe('CREDITADO');
    expect(res.body.data.pix).toBeTruthy();
    expect(res.body.data.pix.pixCopiaECola).toBeUndefined();
    expect(res.body.data.pix.txid).toBe('tx1');
  });
});
