const request = require('supertest');
const app = require('../src/server');
const { prisma } = require('../src/config/database');

const BEARER = `Bearer ${global.testToken}`;

describe('Charges API — cobranças reais do usuário', () => {
  beforeEach(() => {
    prisma.user.findUnique.mockResolvedValue(global.testUser);
    prisma.loanInsuranceCharge.findMany.mockResolvedValue([
      {
        id: 'lic-1',
        loanId: 'loan-1',
        userId: global.testUser.id,
        amount: 39.9,
        status: 'pendente',
        createdAt: new Date('2026-05-08T12:00:00.000Z'),
        paidAt: null,
        emprestimo: { id: 'loan-1', status: 'aprovado' },
      },
    ]);
    prisma.cardShipment.findMany.mockResolvedValue([]);
    prisma.loanInsuranceCharge.findFirst.mockImplementation(async ({ where }) => {
      if (where.id === 'lic-1' && where.userId === global.testUser.id) {
        return {
          id: 'lic-1',
          loanId: 'loan-1',
          userId: global.testUser.id,
          amount: 39.9,
          status: 'pendente',
          createdAt: new Date('2026-05-08T12:00:00.000Z'),
          paidAt: null,
          emprestimo: { id: 'loan-1', status: 'aprovado', valorAprovado: 5000 },
        };
      }
      return null;
    });
  });

  it('GET /api/charges lista cobranças pendentes', async () => {
    const res = await request(app).get('/api/charges').set('Authorization', BEARER).expect(200);

    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.charges)).toBe(true);
    expect(res.body.data.charges.length).toBe(1);
    expect(res.body.data.charges[0].type).toBe('loan_insurance');
    expect(res.body.data.charges[0].title).toBe('Seguro do empréstimo');
    expect(res.body.data.charges[0].amount).toBe(39.9);
  });

  it('GET /api/charges/:id retorna detalhe e usuário mascarado', async () => {
    const res = await request(app).get('/api/charges/lic-1').set('Authorization', BEARER).expect(200);

    expect(res.body.data.charge.protocol).toMatch(/^AGIL-LI-/);
    expect(res.body.data.user.name).toBe(global.testUser.nomeCompleto);
    expect(res.body.data.user.cpf).toContain('***');
  });

  it('POST /api/charges/:id/pix retorna pix_key sem alterar saldo', async () => {
    const res = await request(app).post('/api/charges/lic-1/pix').set('Authorization', BEARER).expect(200);

    expect(res.body.data.pixMode).toBe('pix_key');
    expect(res.body.data.pixKey).toBeTruthy();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('GET /api/charges/:id inexistente retorna 404', async () => {
    prisma.loanInsuranceCharge.findFirst.mockResolvedValueOnce(null);
    prisma.cardShipment.findFirst.mockResolvedValueOnce(null);

    const res = await request(app).get('/api/charges/outro-id').set('Authorization', BEARER).expect(404);

    expect(res.body.code).toBe('CHARGE_NOT_FOUND');
  });
});
