-- In-app notifications: metadata, read timestamp, idempotency key
ALTER TABLE "notificacoes" ADD COLUMN IF NOT EXISTS "metadata" JSONB;
ALTER TABLE "notificacoes" ADD COLUMN IF NOT EXISTS "readAt" TIMESTAMP(3);
ALTER TABLE "notificacoes" ADD COLUMN IF NOT EXISTS "dedupeKey" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "notificacoes_dedupeKey_key" ON "notificacoes"("dedupeKey");
