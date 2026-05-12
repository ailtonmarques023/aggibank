'use strict';

const { prisma } = require('../src/config/database');
const {
  assertDepositDailyLimits,
  DEPOSIT_COUNT_STATUSES,
} = require('../src/services/operationalLimitsService');

describe('operationalLimitsService — depósito', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('agrega apenas PIX_GERADO, PAGO e CREDITADO (não conta cancelado/expirado/pendente)', async () => {
    prisma.accountDeposit.aggregate.mockResolvedValue({
      _sum: { amount: 0 },
      _count: { _all: 0 },
    });

    await assertDepositDailyLimits(prisma, 'user-1', 10);

    expect(prisma.accountDeposit.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: DEPOSIT_COUNT_STATUSES },
        }),
      }),
    );
    expect(DEPOSIT_COUNT_STATUSES).toEqual(['PIX_GERADO', 'PAGO', 'CREDITADO']);
  });
});
