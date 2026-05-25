'use strict';

const { prisma } = require('../src/config/database');
const {
  noteActiveApplicationDuplicate,
  ACTIVE_APPLICATION_DEDUP_STATUSES,
  ACTIVE_APPLICATION_DEDUP_MESSAGE,
} = require('../src/services/accountApplicationService');

describe('noteActiveApplicationDuplicate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.accountApplication.findFirst.mockResolvedValue(null);
  });

  it('exporta lista explícita de status ativos', () => {
    expect(ACTIVE_APPLICATION_DEDUP_STATUSES).toEqual([
      'DRAFT',
      'DATA_RECEIVED',
      'DOCUMENTS_PENDING',
      'READY_TO_FINALIZE',
      'DOCUMENTS_APPROVED',
      'RESUBMISSION_REQUIRED',
    ]);
    expect(ACTIVE_APPLICATION_DEDUP_STATUSES).not.toContain('FINALIZED');
    expect(ACTIVE_APPLICATION_DEDUP_STATUSES).not.toContain('EXPIRED');
    expect(ACTIVE_APPLICATION_DEDUP_STATUSES).not.toContain('CANCELLED');
    expect(ACTIVE_APPLICATION_DEDUP_STATUSES).not.toContain('REJECTED');
  });

  it('consulta CPF apenas com status ativos e expiresAt futuro', async () => {
    await noteActiveApplicationDuplicate({
      cpf: '15377233409',
      email: 'novo@example.com',
    });

    expect(prisma.accountApplication.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          cpf: '15377233409',
          status: { in: [...ACTIVE_APPLICATION_DEDUP_STATUSES] },
          expiresAt: { gt: expect.any(Date) },
        }),
      })
    );
  });

  it('não bloqueia quando não há proposta ativa não expirada', async () => {
    await expect(
      noteActiveApplicationDuplicate({ cpf: '52998224725', email: 'a@example.com' })
    ).resolves.toEqual([]);
  });

  it('bloqueia CPF com proposta ativa não expirada', async () => {
    prisma.accountApplication.findFirst.mockImplementation(({ where }) => {
      if (where.cpf) return Promise.resolve({ id: 'app_active' });
      return Promise.resolve(null);
    });

    await expect(
      noteActiveApplicationDuplicate({ cpf: '52998224725', email: 'a@example.com' })
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'APPLICATION_CPF_ACTIVE',
      message: ACTIVE_APPLICATION_DEDUP_MESSAGE,
    });
  });

  it('bloqueia e-mail com proposta ativa não expirada', async () => {
    prisma.accountApplication.findFirst.mockImplementation(({ where }) => {
      if (where.email) return Promise.resolve({ id: 'app_active' });
      return Promise.resolve(null);
    });

    await expect(
      noteActiveApplicationDuplicate({ cpf: '52998224725', email: 'dup@example.com' })
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'APPLICATION_EMAIL_ACTIVE',
      message: ACTIVE_APPLICATION_DEDUP_MESSAGE,
    });
  });
});
