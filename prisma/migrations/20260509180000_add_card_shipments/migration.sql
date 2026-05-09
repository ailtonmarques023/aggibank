-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('AGUARDANDO_COBRANCA', 'COBRANCA_CONFIRMADA', 'EM_PRODUCAO', 'POSTADO', 'EM_TRANSITO', 'SAIU_PARA_ENTREGA', 'ENTREGUE', 'FALHA_ENTREGA', 'DEVOLVIDO');

-- CreateEnum
CREATE TYPE "ShipmentFeeStatus" AS ENUM ('PENDENTE', 'DEBITADO', 'RECUSADO');

-- CreateEnum
CREATE TYPE "ShipmentEventType" AS ENUM ('SHIPMENT_CREATED', 'FRETE_COBRADO', 'FRETE_RECUSADO', 'STATUS_ATUALIZADO');

-- CreateEnum
CREATE TYPE "ShipmentActorType" AS ENUM ('SYSTEM', 'USER', 'INTERNAL_API');

-- CreateTable
CREATE TABLE "card_shipments" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "ShipmentStatus" NOT NULL DEFAULT 'AGUARDANDO_COBRANCA',
    "shippingFeeAmount" DECIMAL(10,2) NOT NULL DEFAULT 39.90,
    "shippingFeeStatus" "ShipmentFeeStatus" NOT NULL DEFAULT 'PENDENTE',
    "shippingFeeMovementId" TEXT,
    "carrierCode" TEXT,
    "carrierName" TEXT,
    "trackingCode" TEXT,
    "trackingUrl" TEXT,
    "estimatedDeliveryAt" TIMESTAMP(3),
    "postedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "returnedAt" TIMESTAMP(3),
    "deliveryAttempts" INTEGER NOT NULL DEFAULT 0,
    "isSecondIssue" BOOLEAN NOT NULL DEFAULT false,
    "originShipmentId" TEXT,
    "idempotencyKeyCharge" TEXT,
    "addressSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "card_shipments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "card_shipment_events" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "userId" TEXT,
    "eventType" "ShipmentEventType" NOT NULL,
    "shipmentStatus" "ShipmentStatus",
    "eventAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT,
    "providerPayload" JSONB,
    "createdByType" "ShipmentActorType" NOT NULL DEFAULT 'SYSTEM',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "card_shipment_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "card_shipments_idempotencyKeyCharge_key" ON "card_shipments"("idempotencyKeyCharge");

-- CreateIndex
CREATE INDEX "card_shipments_cardId_idx" ON "card_shipments"("cardId");

-- CreateIndex
CREATE INDEX "card_shipments_userId_idx" ON "card_shipments"("userId");

-- CreateIndex
CREATE INDEX "card_shipments_trackingCode_idx" ON "card_shipments"("trackingCode");

-- CreateIndex
CREATE INDEX "card_shipment_events_shipmentId_eventAt_idx" ON "card_shipment_events"("shipmentId", "eventAt");

-- AddForeignKey
ALTER TABLE "card_shipments" ADD CONSTRAINT "card_shipments_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "cartoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_shipments" ADD CONSTRAINT "card_shipments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_shipments" ADD CONSTRAINT "card_shipments_shippingFeeMovementId_fkey" FOREIGN KEY ("shippingFeeMovementId") REFERENCES "movimentacoes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_shipments" ADD CONSTRAINT "card_shipments_originShipmentId_fkey" FOREIGN KEY ("originShipmentId") REFERENCES "card_shipments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_shipment_events" ADD CONSTRAINT "card_shipment_events_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "card_shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_shipment_events" ADD CONSTRAINT "card_shipment_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
