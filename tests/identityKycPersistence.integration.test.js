'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

/**
 * Persistência opcional (ver IVAR Fatia 5).
 * Define RUN_IDENTITY_KYC_DB_TEST=1 e DATABASE_URL apontando para base com migrations aplicadas.
 * Evite usar banco produção sem snapshot/descarte controlado do usuário de teste.
 */

const crypto = require('crypto');

const shouldRun =
  process.env.RUN_IDENTITY_KYC_DB_TEST === '1' &&
  !!process.env.DATABASE_URL &&
  process.env.DATABASE_URL.trim() !== '';

const suite = shouldRun ? describe : describe.skip;

suite('identity KYC — persistência Prisma (opt-in)', () => {
  /** @type {import('@prisma/client').PrismaClient} */
  let prisma;

  beforeAll(() => {
    // eslint-disable-next-line global-require
    const { PrismaClient } = require('@prisma/client');
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
  });

  it('cria usuário auxiliar, IdentitySubmission + Artifact ligados ao User; objectKey único', async () => {
    const suffix = crypto.randomBytes(8).toString('hex');

    let userId;
    let submissionId;

    try {
      const createdUser = await prisma.user.create({
        data: {
          nomeCompleto: 'KYC Persist Test User',
          email: `kyc-persist-test-${suffix}@example.invalid`,
          cpf: suffix.padEnd(11, '0').slice(-11),
          dataNascimento: new Date('1991-06-01T00:00:00Z'),
          senha: 'hashed_test_only',
          identityReviewStatus: 'NONE',
        },
      });
      userId = createdUser.id;

      expect(createdUser.isVerificado).toBe(false);

      const submission = await prisma.identitySubmission.create({
        data: {
          userId,
          status: 'DRAFT',
          artifacts: {
            create: [
              {
                type: 'DOCUMENT_FRONT',
                bucket: 'unit-test-bucket',
                objectKey: `identity/test-sub-${suffix}/artifact-${suffix}`,
                uploadStatus: 'AWAITING_UPLOAD',
                storageProvider: 'S3_COMPAT',
              },
            ],
          },
        },
        include: { artifacts: true },
      });
      submissionId = submission.id;

      expect(submission.artifacts).toHaveLength(1);
      expect(submission.artifacts[0].objectKey).toContain(suffix);

      const readBack = await prisma.identitySubmission.findFirstOrThrow({
        where: { id: submissionId },
        include: { user: true, artifacts: true },
      });

      expect(readBack.userId).toBe(userId);
      expect(readBack.user.identityReviewStatus).toBe('NONE');
      expect(readBack.artifacts.length).toBe(1);

      await prisma.user.update({
        where: { id: userId },
        data: {
          lastIdentitySubmissionId: submissionId,
          identityReviewStatus: 'PENDING',
        },
      });

      const u2 = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
      });
      expect(u2.lastIdentitySubmissionId).toBe(submissionId);
      expect(u2.identityReviewStatus).toBe('PENDING');

      await expect(
        prisma.identitySubmissionArtifact.create({
          data: {
            submissionId,
            type: 'DOCUMENT_FRONT',
            bucket: 'same-bucket',
            objectKey: readBack.artifacts[0].objectKey,
          },
        })
      ).rejects.toThrow();
    } finally {
      if (submissionId) {
        await prisma.identitySubmissionArtifact.deleteMany({
          where: { submissionId },
        });
        await prisma.identitySubmission.deleteMany({ where: { id: submissionId } });
      }
      if (userId) {
        await prisma.user.updateMany({
          where: { id: userId },
          data: { lastIdentitySubmissionId: null },
        });
        await prisma.user.deleteMany({ where: { id: userId } });
      }
    }
  });
});
