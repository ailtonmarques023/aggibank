-- Fase U.4: observabilidade de origem do webhook Pix Efi.
-- Campos nullable para preservar compatibilidade com eventos historicos.

ALTER TABLE "pix_webhook_events"
  ADD COLUMN "source" TEXT,
  ADD COLUMN "requestPath" TEXT,
  ADD COLUMN "requestMethod" TEXT,
  ADD COLUMN "httpStatus" INTEGER,
  ADD COLUMN "receivedAt" TIMESTAMP(3),
  ADD COLUMN "providerEventId" TEXT;

CREATE INDEX "pix_webhook_events_source_receivedAt_idx" ON "pix_webhook_events"("source", "receivedAt");

CREATE INDEX "pix_webhook_events_providerEventId_idx" ON "pix_webhook_events"("providerEventId");
