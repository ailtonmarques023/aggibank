const request = require('supertest');
const app = require('../src/server');
const { prisma } = require('../src/config/database');

describe('Referral Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue(global.testUser);
    prisma.$transaction.mockImplementation(async (arg) => {
      if (typeof arg === 'function') {
        return arg(prisma);
      }
      return Promise.all(arg);
    });
  });

  describe('GET /api/referrals/me', () => {
    it('retorna código, progresso e recompensas do usuário', async () => {
      prisma.referralCode.findUnique.mockResolvedValue({
        id: 'rc-1',
        userId: global.testUser.id,
        code: 'TEST1234',
        isActive: true,
      });
      prisma.referral.count
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(1);
      prisma.referralReward.findMany.mockResolvedValue([
        {
          id: 'rw-1',
          userId: global.testUser.id,
          cycleNumber: 1,
          requiredCount: 10,
          amount: 25,
          status: 'BLOQUEADO',
          createdAt: new Date('2026-05-19T12:00:00.000Z'),
          releasedAt: null,
        },
      ]);
      prisma.referral.findMany.mockResolvedValue([
        {
          id: 'ref-1',
          status: 'VALIDA',
          referralCode: 'TEST1234',
          createdAt: new Date('2026-05-19T12:00:00.000Z'),
          qualifiedAt: new Date('2026-05-19T12:05:00.000Z'),
          referred: { nomeCompleto: 'Cliente Indicado' },
        },
      ]);

      const response = await request(app)
        .get('/api/referrals/me')
        .set('Authorization', `Bearer ${global.testToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        code: 'TEST1234',
        requiredReferrals: 10,
        rewardPerCycle: 25,
        validReferrals: 3,
        pendingReferrals: 1,
        currentCycleProgress: 3,
        blockedReward: 25,
      });
      expect(response.body.data.recent[0].referredName).toBe('Cliente Indicado');
    });
  });

  describe('POST /api/referrals/ensure-code', () => {
    it('gera código quando usuário ainda não tem', async () => {
      prisma.referralCode.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
      prisma.referralCode.create.mockResolvedValue({
        id: 'rc-new',
        userId: global.testUser.id,
        code: 'USUA1234',
        isActive: true,
      });

      const response = await request(app)
        .post('/api/referrals/ensure-code')
        .set('Authorization', `Bearer ${global.testToken}`)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.code).toBe('USUA1234');
      expect(prisma.referralCode.create).toHaveBeenCalled();
    });
  });
});
