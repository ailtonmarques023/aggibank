const request = require('supertest');
const app = require('../src/server');
const { prisma } = require('../src/config/database');

const BEARER = `Bearer ${global.testToken}`;

describe('GET /api/charges', () => {
  beforeEach(() => {
    prisma.user.findUnique.mockResolvedValue(global.testUser);
    prisma.boleto.findMany.mockResolvedValue([]);
    prisma.loanInsuranceCharge.findMany.mockResolvedValue([]);
    prisma.cardShipment.findMany.mockResolvedValue([]);
    prisma.boleto.findUnique.mockResolvedValue(null);
    prisma.pixCobranca.findFirst.mockResolvedValue(null);
  });

  it('retorna lista vazia quando não há cobranças', async () => {
    const res = await request(app).get('/api/charges').set('Authorization', BEARER).expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.charges).toEqual([]);
  });

  it('retorna cobrança de seguro pendente', async () => {
    prisma.loanInsuranceCharge.findMany.mockResolvedValue([
      {
        id: 'charge-lic-1',
        loanId: 'loan-1',
        userId: global.testUser.id,
        amount: 39.9,
        status: 'pendente',
        createdAt: new Date('2026-05-09T14:30:00.000Z'),
        paidAt: null,
        idempotencyKey: null,
      },
    ]);

    const res = await request(app).get('/api/charges').set('Authorization', BEARER).expect(200);
    expect(res.body.data.charges.length).toBe(1);
    expect(res.body.data.charges[0].id).toBe('lic_charge-lic-1');
    expect(res.body.data.charges[0].type).toBe('loan_insurance');
    expect(res.body.data.charges[0].product).toBe('Seguro do empréstimo');
    expect(res.body.data.charges[0].amount).toBe(39.9);
  });
});

describe('GET /api/charges/:id', () => {
  beforeEach(() => {
    prisma.user.findUnique.mockResolvedValue(global.testUser);
    prisma.pixCobranca.findFirst.mockResolvedValue(null);
  });

  it('retorna 404 para id inválido', async () => {
    await request(app).get('/api/charges/xxx').set('Authorization', BEARER).expect(404);
  });

  it('retorna detalhe com CPF mascarado e protocolo', async () => {
    prisma.loanInsuranceCharge.findFirst.mockResolvedValue({
      id: 'charge-lic-1',
      loanId: 'loan-1',
      userId: global.testUser.id,
      amount: 39.9,
      status: 'pendente',
      createdAt: new Date('2026-05-09T14:30:00.000Z'),
      paidAt: null,
      idempotencyKey: null,
    });

    const res = await request(app)
      .get('/api/charges/lic_charge-lic-1')
      .set('Authorization', BEARER)
      .expect(200);

    expect(res.body.data.user.name).toBe(global.testUser.nomeCompleto);
    expect(res.body.data.user.cpf).toMatch(/^\d{3}\.\*\*\*\.\*\*\*-\d{2}$/);
    expect(res.body.data.charge.type).toBe('loan_insurance');
    expect(res.body.data.charge.protocol).toMatch(/^AGIL-COB-\d{6}$/);
    expect(res.body.data.charge.amount).toBe(39.9);
  });

  it('inclui campos Pix Efí quando existe PixCobranca ativa', async () => {
    prisma.loanInsuranceCharge.findFirst.mockResolvedValue({
      id: 'charge-lic-1',
      loanId: 'loan-1',
      userId: global.testUser.id,
      amount: 39.9,
      status: 'pendente',
      createdAt: new Date('2026-05-09T14:30:00.000Z'),
      paidAt: null,
      idempotencyKey: null,
    });
    prisma.pixCobranca.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'pc1',
        userId: global.testUser.id,
        linkedEntityType: 'loan_insurance',
        linkedEntityId: 'charge-lic-1',
        amount: 39.9,
        status: 'ATIVA',
        txid: 'txidFaseNUnitTestChargeGet01',
        endToEndId: null,
        providerReference: '77',
        pixCopiaECola: '00020101021226840014BR.GOV.BCB.PIX2564',
        qrCodePix: null,
        expiresAt: new Date('2026-12-01T12:00:00.000Z'),
        paidAt: null,
        idempotencyKey: 'k1',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

    const res = await request(app)
      .get('/api/charges/lic_charge-lic-1')
      .set('Authorization', BEARER)
      .expect(200);

    expect(res.body.data.charge.pixStatus).toBe('ATIVA');
    expect(res.body.data.charge.txid).toBe('txidFaseNUnitTestChargeGet01');
    expect(res.body.data.charge.providerReference).toBe('77');
    expect(res.body.data.charge.pixCopiaECola).toContain('000201');
    expect(res.body.data.charge.pixPaidAt).toBeNull();
  });
});

describe('POST /api/charges/:id/pix', () => {
  const prevPix = process.env.PIX_RECEIVER_KEY;
  const prevEfi = {
    id: process.env.EFI_CLIENT_ID,
    sec: process.env.EFI_CLIENT_SECRET,
    key: process.env.EFI_PIX_KEY,
    b64: process.env.EFI_CERTIFICATE_BASE64,
    path: process.env.EFI_CERTIFICATE_PATH,
  };

  beforeEach(() => {
    prisma.user.findUnique.mockResolvedValue(global.testUser);
    prisma.loanInsuranceCharge.findFirst.mockResolvedValue({
      id: 'charge-lic-1',
      loanId: 'loan-1',
      userId: global.testUser.id,
      amount: 39.9,
      status: 'pendente',
      createdAt: new Date('2026-05-09T14:30:00.000Z'),
      paidAt: null,
      idempotencyKey: null,
    });
    delete process.env.EFI_CLIENT_ID;
    delete process.env.EFI_CLIENT_SECRET;
    delete process.env.EFI_PIX_KEY;
    delete process.env.EFI_CERTIFICATE_BASE64;
    delete process.env.EFI_CERTIFICATE_PATH;
    delete process.env.EFI_PIX_ENABLE_PRODUCTION;
    process.env.EFI_ENVIRONMENT = 'sandbox';
    process.env.PIX_RECEIVER_KEY = 'recebedor@agilbank.com';
  });

  afterEach(() => {
    process.env.PIX_RECEIVER_KEY = prevPix;
    if (prevEfi.id !== undefined) process.env.EFI_CLIENT_ID = prevEfi.id;
    else delete process.env.EFI_CLIENT_ID;
    if (prevEfi.sec !== undefined) process.env.EFI_CLIENT_SECRET = prevEfi.sec;
    else delete process.env.EFI_CLIENT_SECRET;
    if (prevEfi.key !== undefined) process.env.EFI_PIX_KEY = prevEfi.key;
    else delete process.env.EFI_PIX_KEY;
    if (prevEfi.b64 !== undefined) process.env.EFI_CERTIFICATE_BASE64 = prevEfi.b64;
    else delete process.env.EFI_CERTIFICATE_BASE64;
    if (prevEfi.path !== undefined) process.env.EFI_CERTIFICATE_PATH = prevEfi.path;
    else delete process.env.EFI_CERTIFICATE_PATH;
  });

  it('retorna chave Pix sem alterar saldo (resposta apenas instruções)', async () => {
    const res = await request(app)
      .post('/api/charges/lic_charge-lic-1/pix')
      .set('Authorization', BEARER)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.pixMode).toBe('chave');
    expect(res.body.data.pixKey).toBe('recebedor@agilbank.com');
    expect(res.body.data.amount).toBe(39.9);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});

describe('POST /api/charges/:id/pix com Efí (serviço mockado)', () => {
  const pixSvc = require('../src/services/pixCobrancaEfiService');
  const prevEfi = {
    id: process.env.EFI_CLIENT_ID,
    sec: process.env.EFI_CLIENT_SECRET,
    key: process.env.EFI_PIX_KEY,
    b64: process.env.EFI_CERTIFICATE_BASE64,
    path: process.env.EFI_CERTIFICATE_PATH,
    env: process.env.EFI_ENVIRONMENT,
    enableProd: process.env.EFI_PIX_ENABLE_PRODUCTION,
  };
  let spy;

  beforeEach(() => {
    prisma.user.findUnique.mockResolvedValue(global.testUser);
    prisma.loanInsuranceCharge.findFirst.mockResolvedValue({
      id: 'charge-lic-1',
      loanId: 'loan-1',
      userId: global.testUser.id,
      amount: 39.9,
      status: 'pendente',
      createdAt: new Date('2026-05-09T14:30:00.000Z'),
      paidAt: null,
      idempotencyKey: null,
    });
    delete process.env.PIX_RECEIVER_KEY;
    process.env.EFI_ENVIRONMENT = 'sandbox';
    delete process.env.EFI_PIX_ENABLE_PRODUCTION;
    process.env.EFI_CLIENT_ID = 'efi-test-client';
    process.env.EFI_CLIENT_SECRET = 'efi-test-secret';
    process.env.EFI_PIX_KEY = 'efipay-dev-key';
    process.env.EFI_CERTIFICATE_BASE64 = Buffer.from('fake-p12').toString('base64');
    delete process.env.EFI_CERTIFICATE_PATH;
    spy = jest.spyOn(pixSvc, 'getOrCreateEfiPixForCharge').mockResolvedValue({
      pixMode: 'copiaecola',
      pixCopiaECola: '00020101021226840014BR.GOV.BCB.PIX2564EFI0000000001',
      pixKey: null,
      amount: 39.9,
      instructions: 'Utilize o código Pix abaixo para realizar o pagamento (Efí).',
      txid: 'txidAgilbankFaseNMockEfiCharge01',
      providerReference: '4242',
      qrCodePix: null,
      expiresAt: new Date('2026-12-31T23:59:59.000Z').toISOString(),
      paidAt: null,
      pixStatus: 'ATIVA',
      source: 'efi',
    });
  });

  afterEach(() => {
    spy.mockRestore();
    if (prevEfi.id !== undefined) process.env.EFI_CLIENT_ID = prevEfi.id;
    else delete process.env.EFI_CLIENT_ID;
    if (prevEfi.sec !== undefined) process.env.EFI_CLIENT_SECRET = prevEfi.sec;
    else delete process.env.EFI_CLIENT_SECRET;
    if (prevEfi.key !== undefined) process.env.EFI_PIX_KEY = prevEfi.key;
    else delete process.env.EFI_PIX_KEY;
    if (prevEfi.b64 !== undefined) process.env.EFI_CERTIFICATE_BASE64 = prevEfi.b64;
    else delete process.env.EFI_CERTIFICATE_BASE64;
    if (prevEfi.path !== undefined) process.env.EFI_CERTIFICATE_PATH = prevEfi.path;
    else delete process.env.EFI_CERTIFICATE_PATH;
    if (prevEfi.env !== undefined) process.env.EFI_ENVIRONMENT = prevEfi.env;
    else delete process.env.EFI_ENVIRONMENT;
    if (prevEfi.enableProd !== undefined) process.env.EFI_PIX_ENABLE_PRODUCTION = prevEfi.enableProd;
    else delete process.env.EFI_PIX_ENABLE_PRODUCTION;
  });

  it('retorna BR Code da Efí e não usa PIX_RECEIVER_KEY', async () => {
    const res = await request(app)
      .post('/api/charges/lic_charge-lic-1/pix')
      .set('Authorization', BEARER)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.source).toBe('efi');
    expect(res.body.data.pixCopiaECola).toContain('000201');
    expect(res.body.data.txid).toBe('txidAgilbankFaseNMockEfiCharge01');
    expect(res.body.data.pixKey).toBeNull();
    expect(spy).toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('segunda chamada reutiliza o mesmo fluxo de serviço (idempotência no serviço)', async () => {
    await request(app).post('/api/charges/lic_charge-lic-1/pix').set('Authorization', BEARER).expect(200);
    await request(app).post('/api/charges/lic_charge-lic-1/pix').set('Authorization', BEARER).expect(200);
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

describe('charges helpers', () => {
  const { _test } = require('../src/routes/charges');

  it('parseChargeParam reconhece prefixos', () => {
    expect(_test.parseChargeParam('lic_abc')).toEqual({ kind: 'loan_insurance', id: 'abc' });
    expect(_test.parseChargeParam('blt_xyz123')).toEqual({ kind: 'boleto', id: 'xyz123' });
    expect(_test.parseChargeParam('csh_ship1')).toEqual({ kind: 'card_shipment', id: 'ship1' });
  });

  it('maskCpf mascara 11 dígitos', () => {
    expect(_test.maskCpf('09516717008')).toBe('095.***.***-08');
  });
});
