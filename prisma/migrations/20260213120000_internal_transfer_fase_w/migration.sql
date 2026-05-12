-- Fase W: transferência interna entre contas AgilBank (ledger obrigatório).

CREATE TABLE "internal_transfers" (
    "id" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "idempotencyKey" TEXT NOT NULL,
    "debitMovementId" TEXT,
    "creditMovementId" TEXT,
    "description" TEXT,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),

    CONSTRAINT "internal_transfers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "internal_transfers_fromUserId_idempotencyKey_key" ON "internal_transfers"("fromUserId", "idempotencyKey");

CREATE INDEX "internal_transfers_fromUserId_createdAt_idx" ON "internal_transfers"("fromUserId", "createdAt");

CREATE INDEX "internal_transfers_toUserId_createdAt_idx" ON "internal_transfers"("toUserId", "createdAt");

ALTER TABLE "internal_transfers" ADD CONSTRAINT "internal_transfers_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "internal_transfers" ADD CONSTRAINT "internal_transfers_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
