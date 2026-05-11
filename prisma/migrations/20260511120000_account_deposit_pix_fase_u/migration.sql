-- CreateTable
CREATE TABLE "account_deposits" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "provider" TEXT NOT NULL DEFAULT 'EFI',
    "pixCobrancaId" TEXT,
    "creditedMovementId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),
    "creditedAt" TIMESTAMP(3),

    CONSTRAINT "account_deposits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "account_deposits_pixCobrancaId_key" ON "account_deposits"("pixCobrancaId");

-- CreateIndex
CREATE INDEX "account_deposits_userId_status_idx" ON "account_deposits"("userId", "status");

-- CreateIndex
CREATE INDEX "account_deposits_userId_createdAt_idx" ON "account_deposits"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "account_deposits" ADD CONSTRAINT "account_deposits_userId_fkey" FOREIGN KEY ("userId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_deposits" ADD CONSTRAINT "account_deposits_pixCobrancaId_fkey" FOREIGN KEY ("pixCobrancaId") REFERENCES "pix_cobrancas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
