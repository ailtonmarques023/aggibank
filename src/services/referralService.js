const crypto = require('crypto');
const { prisma } = require('../config/database');
const logger = require('../utils/logger');

const REQUIRED_REFERRALS = 10;
const REWARD_AMOUNT = 25;

function normalizeReferralCode(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function buildReferralCodeSeed(user) {
  const name = String(user && user.nomeCompleto ? user.nomeCompleto : 'AGIL')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]/gi, '')
    .toUpperCase()
    .slice(0, 4)
    .padEnd(4, 'A');
  const suffix = crypto.randomBytes(3).toString('hex').toUpperCase();
  return normalizeReferralCode(`${name}${suffix}`).slice(0, 10);
}

async function generateUniqueReferralCode(tx, user) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = buildReferralCodeSeed(user);
    const existing = await tx.referralCode.findUnique({ where: { code } });
    if (!existing) return code;
  }
  return crypto.randomBytes(5).toString('hex').toUpperCase();
}

async function ensureReferralCode(userId, client = prisma) {
  const existing = await client.referralCode.findUnique({
    where: { userId },
  });
  if (existing) return existing;

  return client.$transaction(async (tx) => {
    const again = await tx.referralCode.findUnique({ where: { userId } });
    if (again) return again;

    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true, nomeCompleto: true },
    });
    if (!user) {
      const error = new Error('USER_NOT_FOUND');
      error.code = 'USER_NOT_FOUND';
      throw error;
    }

    const code = await generateUniqueReferralCode(tx, user);
    return tx.referralCode.create({
      data: {
        userId,
        code,
      },
    });
  });
}

async function attachReferralToNewUser({ referredUserId, referralCode }, client = prisma) {
  const code = normalizeReferralCode(referralCode);
  if (!code || !referredUserId) return null;

  try {
    const owner = await client.referralCode.findUnique({
      where: { code },
      include: { user: { select: { id: true, isAtivo: true } } },
    });
    if (!owner || !owner.isActive || !owner.user || !owner.user.isAtivo) return null;
    if (owner.userId === referredUserId) return null;

    return await client.referral.create({
      data: {
        referrerUserId: owner.userId,
        referredUserId,
        referralCode: owner.code,
        status: 'PENDENTE',
      },
    });
  } catch (error) {
    if (error && error.code === 'P2002') return null;
    logger.warn(error, {
      context: 'attach-referral-to-new-user',
      referredUserId,
      referralCode: code,
    });
    return null;
  }
}

async function processReferralRewards(tx, referrerUserId) {
  const validCount = await tx.referral.count({
    where: {
      referrerUserId,
      status: 'VALIDA',
    },
  });
  const earnedCycles = Math.floor(validCount / REQUIRED_REFERRALS);

  for (let cycle = 1; cycle <= earnedCycles; cycle += 1) {
    const existingReward = await tx.referralReward.findUnique({
      where: {
        userId_cycleNumber: {
          userId: referrerUserId,
          cycleNumber: cycle,
        },
      },
    });
    if (existingReward) continue;

    const user = await tx.user.findUnique({
      where: { id: referrerUserId },
      select: { saldoAtual: true, saldoBloqueado: true },
    });
    if (!user) continue;

    const saldoAnterior = Number(user.saldoAtual || 0);
    const blockedBefore = Number(user.saldoBloqueado || 0);
    const movement = await tx.movimentacao.create({
      data: {
        userId: referrerUserId,
        tipo: 'credito',
        descricao: `Recompensa Indique e Ganhe - ciclo ${cycle}`,
        valor: REWARD_AMOUNT,
        saldoAnterior,
        saldoAtual: saldoAnterior,
        categoria: 'indicacao_recompensa_bloqueada',
        referenceType: 'referral_reward',
        referenceId: `cycle:${cycle}`,
        idempotencyKey: `referral_reward:${referrerUserId}:${cycle}`,
      },
    });

    await tx.user.update({
      where: { id: referrerUserId },
      data: {
        saldoBloqueado: blockedBefore + REWARD_AMOUNT,
      },
    });

    await tx.referralReward.create({
      data: {
        userId: referrerUserId,
        cycleNumber: cycle,
        requiredCount: REQUIRED_REFERRALS,
        amount: REWARD_AMOUNT,
        status: 'BLOQUEADO',
        blockedMovementId: movement.id,
      },
    });
  }
}

async function qualifyReferralForVerifiedUser(referredUserId, client = prisma) {
  if (!referredUserId) return null;

  return client.$transaction(async (tx) => {
    const referral = await tx.referral.findUnique({
      where: { referredUserId },
    });
    if (!referral || referral.status === 'VALIDA') return referral;
    if (referral.status === 'REJEITADA') return referral;

    const updated = await tx.referral.update({
      where: { id: referral.id },
      data: {
        status: 'VALIDA',
        qualifiedAt: new Date(),
      },
    });

    await processReferralRewards(tx, updated.referrerUserId);
    return updated;
  });
}

async function getReferralDashboard(userId, client = prisma) {
  const code = await ensureReferralCode(userId, client);
  const [validCount, pendingCount, rewards, recent] = await Promise.all([
    client.referral.count({ where: { referrerUserId: userId, status: 'VALIDA' } }),
    client.referral.count({ where: { referrerUserId: userId, status: 'PENDENTE' } }),
    client.referralReward.findMany({
      where: { userId },
      orderBy: { cycleNumber: 'asc' },
    }),
    client.referral.findMany({
      where: { referrerUserId: userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        referred: {
          select: {
            nomeCompleto: true,
            createdAt: true,
          },
        },
      },
    }),
  ]);

  const completedCycles = Math.floor(validCount / REQUIRED_REFERRALS);
  const currentCycleProgress = validCount % REQUIRED_REFERRALS;
  const blockedReward = rewards
    .filter((r) => r.status === 'BLOQUEADO')
    .reduce((sum, r) => sum + Number(r.amount || 0), 0);
  const availableReward = rewards
    .filter((r) => r.status === 'LIBERADO')
    .reduce((sum, r) => sum + Number(r.amount || 0), 0);

  return {
    code: code.code,
    requiredReferrals: REQUIRED_REFERRALS,
    rewardPerCycle: REWARD_AMOUNT,
    validReferrals: validCount,
    pendingReferrals: pendingCount,
    completedCycles,
    currentCycleProgress,
    blockedReward,
    availableReward,
    rewards: rewards.map((r) => ({
      id: r.id,
      cycleNumber: r.cycleNumber,
      requiredCount: r.requiredCount,
      amount: Number(r.amount || 0),
      status: r.status,
      createdAt: r.createdAt,
      releasedAt: r.releasedAt,
    })),
    recent: recent.map((r) => ({
      id: r.id,
      status: r.status,
      referralCode: r.referralCode,
      createdAt: r.createdAt,
      qualifiedAt: r.qualifiedAt,
      referredName: r.referred && r.referred.nomeCompleto ? r.referred.nomeCompleto : 'Convidado',
    })),
  };
}

module.exports = {
  REQUIRED_REFERRALS,
  REWARD_AMOUNT,
  normalizeReferralCode,
  ensureReferralCode,
  attachReferralToNewUser,
  qualifyReferralForVerifiedUser,
  getReferralDashboard,
};
