-- CreateTable
CREATE TABLE "pix_cobrancas" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "linkedEntityType" TEXT NOT NULL,
    "linkedEntityId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ATIVA',
    "txid" TEXT NOT NULL,
    "providerReference" TEXT,
    "pixCopiaECola" TEXT,
    "qrCodePix" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "idempotencyKey" TEXT NOT NULL,
    "rawProviderPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pix_cobrancas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pix_cobrancas_txid_key" ON "pix_cobrancas"("txid");

-- CreateIndex
CREATE UNIQUE INDEX "pix_cobrancas_idempotencyKey_key" ON "pix_cobrancas"("idempotencyKey");

-- CreateIndex
CREATE INDEX "pix_cobrancas_userId_linkedEntityType_linkedEntityId_idx" ON "pix_cobrancas"("userId", "linkedEntityType", "linkedEntityId");

-- AddForeignKey
ALTER TABLE "pix_cobrancas" ADD CONSTRAINT "pix_cobrancas_userId_fkey" FOREIGN KEY ("userId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
