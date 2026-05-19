CREATE TABLE "public"."referral_codes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "referral_codes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."referrals" (
    "id" TEXT NOT NULL,
    "referrerUserId" TEXT NOT NULL,
    "referredUserId" TEXT NOT NULL,
    "referralCode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "qualifiedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."referral_rewards" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cycleNumber" INTEGER NOT NULL,
    "requiredCount" INTEGER NOT NULL DEFAULT 10,
    "amount" DECIMAL(10,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'BLOQUEADO',
    "blockedMovementId" TEXT,
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "referral_rewards_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "referral_codes_userId_key" ON "public"."referral_codes"("userId");
CREATE UNIQUE INDEX "referral_codes_code_key" ON "public"."referral_codes"("code");
CREATE INDEX "referral_codes_code_idx" ON "public"."referral_codes"("code");
CREATE UNIQUE INDEX "referrals_referredUserId_key" ON "public"."referrals"("referredUserId");
CREATE INDEX "referrals_referrerUserId_status_idx" ON "public"."referrals"("referrerUserId", "status");
CREATE INDEX "referrals_referralCode_idx" ON "public"."referrals"("referralCode");
CREATE UNIQUE INDEX "referral_rewards_userId_cycleNumber_key" ON "public"."referral_rewards"("userId", "cycleNumber");
CREATE INDEX "referral_rewards_userId_status_idx" ON "public"."referral_rewards"("userId", "status");

ALTER TABLE "public"."referral_codes" ADD CONSTRAINT "referral_codes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."referrals" ADD CONSTRAINT "referrals_referrerUserId_fkey" FOREIGN KEY ("referrerUserId") REFERENCES "public"."usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."referrals" ADD CONSTRAINT "referrals_referredUserId_fkey" FOREIGN KEY ("referredUserId") REFERENCES "public"."usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."referral_rewards" ADD CONSTRAINT "referral_rewards_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."referral_rewards" ADD CONSTRAINT "referral_rewards_blockedMovementId_fkey" FOREIGN KEY ("blockedMovementId") REFERENCES "public"."movimentacoes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
