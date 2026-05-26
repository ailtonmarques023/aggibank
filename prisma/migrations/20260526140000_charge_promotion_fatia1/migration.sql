-- CreateEnum
CREATE TYPE "ChargePromotionStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'PAID', 'CANCELLED');

-- CreateTable
CREATE TABLE "charge_promotions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" "ChargePromotionStatus" NOT NULL DEFAULT 'ACTIVE',
    "discountPercent" INTEGER NOT NULL,
    "originalAmountCents" INTEGER NOT NULL,
    "discountAmountCents" INTEGER NOT NULL,
    "promotionalAmountCents" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "notificationSentAt" TIMESTAMP(3),
    "emailSentAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "charge_promotions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "charge_promotion_items" (
    "id" TEXT NOT NULL,
    "promotionId" TEXT NOT NULL,
    "publicChargeId" TEXT NOT NULL,
    "publicChargeType" TEXT NOT NULL,
    "linkedEntityType" TEXT NOT NULL,
    "linkedEntityId" TEXT NOT NULL,
    "originalAmountCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "charge_promotion_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "charge_promotions_idempotencyKey_key" ON "charge_promotions"("idempotencyKey");

-- CreateIndex
CREATE INDEX "charge_promotions_userId_status_idx" ON "charge_promotions"("userId", "status");

-- CreateIndex
CREATE INDEX "charge_promotions_expiresAt_idx" ON "charge_promotions"("expiresAt");

-- CreateIndex
CREATE INDEX "charge_promotions_createdAt_idx" ON "charge_promotions"("createdAt");

-- CreateIndex
CREATE INDEX "charge_promotion_items_promotionId_idx" ON "charge_promotion_items"("promotionId");

-- CreateIndex
CREATE INDEX "charge_promotion_items_linkedEntityType_linkedEntityId_idx" ON "charge_promotion_items"("linkedEntityType", "linkedEntityId");

-- CreateIndex
CREATE UNIQUE INDEX "charge_promotion_items_promotionId_linkedEntityType_linkedEnt_key" ON "charge_promotion_items"("promotionId", "linkedEntityType", "linkedEntityId");

-- AddForeignKey
ALTER TABLE "charge_promotions" ADD CONSTRAINT "charge_promotions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "charge_promotion_items" ADD CONSTRAINT "charge_promotion_items_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "charge_promotions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
