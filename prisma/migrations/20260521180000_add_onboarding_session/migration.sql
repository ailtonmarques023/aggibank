-- Sessão HTTP-only de onboarding (proposta temporária; sem User/conta).

CREATE TYPE "OnboardingSessionStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED', 'COMPLETED');

CREATE TABLE "onboarding_sessions" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "sessionHash" TEXT NOT NULL,
    "status" "OnboardingSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "userAgentHash" TEXT,
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "onboarding_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "onboarding_sessions_sessionHash_key" ON "onboarding_sessions"("sessionHash");
CREATE INDEX "onboarding_sessions_applicationId_status_idx" ON "onboarding_sessions"("applicationId", "status");

ALTER TABLE "onboarding_sessions" ADD CONSTRAINT "onboarding_sessions_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "account_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
