-- Fase S.2: settlementResult e settlementAt em pix_webhook_events.
-- Fase S.3: campos de observabilidade financeira do provedor em pix_cobrancas.

-- S.2: resultado do settlement persistido no próprio evento do webhook.
ALTER TABLE "pix_webhook_events"
    ADD COLUMN "settlementResult"  TEXT,
    ADD COLUMN "settlementAt"      TIMESTAMP(3);

-- S.3: valores financeiros do provedor (bruto, taxa, líquido).
-- providerFeeAmount e netAmount permanecem NULL até fonte confiável (API Efí não fornece taxa no payload Pix).
ALTER TABLE "pix_cobrancas"
    ADD COLUMN "grossAmount"          DECIMAL(12,4),
    ADD COLUMN "providerFeeAmount"    DECIMAL(12,4),
    ADD COLUMN "netAmount"            DECIMAL(12,4),
    ADD COLUMN "providerFeeCurrency"  TEXT DEFAULT 'BRL',
    ADD COLUMN "providerFeeSource"    TEXT,
    ADD COLUMN "providerFeeCapturedAt" TIMESTAMP(3);
