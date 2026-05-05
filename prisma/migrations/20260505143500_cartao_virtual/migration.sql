-- CreateTable
CREATE TABLE "cartoes_virtuais" (
    "id" TEXT NOT NULL,
    "cartaoId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "maskedNumber" TEXT NOT NULL,
    "last4" VARCHAR(4) NOT NULL,
    "validade" TEXT NOT NULL,
    "bandeira" TEXT NOT NULL,
    "cardToken" TEXT NOT NULL,
    "cvvHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ativo',
    "dataBloqueio" TIMESTAMP(3),
    "dataCancelado" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cartoes_virtuais_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cartoes_virtuais_cardToken_key" ON "cartoes_virtuais"("cardToken");

-- CreateIndex
CREATE INDEX "cartoes_virtuais_cartaoId_idx" ON "cartoes_virtuais"("cartaoId");

-- CreateIndex
CREATE INDEX "cartoes_virtuais_userId_idx" ON "cartoes_virtuais"("userId");

-- AddForeignKey
ALTER TABLE "cartoes_virtuais" ADD CONSTRAINT "cartoes_virtuais_cartaoId_fkey" FOREIGN KEY ("cartaoId") REFERENCES "cartoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cartoes_virtuais" ADD CONSTRAINT "cartoes_virtuais_userId_fkey" FOREIGN KEY ("userId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
