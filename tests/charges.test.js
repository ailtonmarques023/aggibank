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
});

describe('POST /api/charges/:id/pix', () => {
  const prevPix = process.env.PIX_RECEIVER_KEY;

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
    process.env.PIX_RECEIVER_KEY = 'recebedor@agilbank.com';
  });

  afterEach(() => {
    process.env.PIX_RECEIVER_KEY = prevPix;
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
