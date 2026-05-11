-- Fase O: eventos de webhook Pix Efí + endToEndId na cobrança (sem settlement de negócio).

ALTER TABLE "pix_cobrancas" ADD COLUMN "endToEndId" TEXT;

CREATE UNIQUE INDEX "pix_cobrancas_endToEndId_key" ON "pix_cobrancas"("endToEndId");

CREATE TABLE "pix_webhook_events" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "txid" TEXT,
    "endToEndId" TEXT,
    "amountReceived" TEXT,
    "processingResult" TEXT NOT NULL,
    "pixCobrancaId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pix_webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pix_webhook_events_idempotencyKey_key" ON "pix_webhook_events"("idempotencyKey");

CREATE INDEX "pix_webhook_events_txid_idx" ON "pix_webhook_events"("txid");

CREATE INDEX "pix_webhook_events_endToEndId_idx" ON "pix_webhook_events"("endToEndId");

CREATE INDEX "pix_webhook_events_pixCobrancaId_idx" ON "pix_webhook_events"("pixCobrancaId");

ALTER TABLE "pix_webhook_events" ADD CONSTRAINT "pix_webhook_events_pixCobrancaId_fkey" FOREIGN KEY ("pixCobrancaId") REFERENCES "pix_cobrancas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
