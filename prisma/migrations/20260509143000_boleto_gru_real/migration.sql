-- GRU / boleto: campos de vínculo com solicitação e PIX (dados persistidos; pixCopiaECola na API vem de PIX_RECEIVER_KEY)
ALTER TABLE "public"."boletos" ADD COLUMN "protocolo" TEXT;
ALTER TABLE "public"."boletos" ADD COLUMN "cpfOuCnpj" TEXT;
ALTER TABLE "public"."boletos" ADD COLUMN "solicitacaoTipo" TEXT;
ALTER TABLE "public"."boletos" ADD COLUMN "solicitacaoId" TEXT;
ALTER TABLE "public"."boletos" ADD COLUMN "pixCopiaECola" TEXT;
ALTER TABLE "public"."boletos" ADD COLUMN "qrCodePix" TEXT;
ALTER TABLE "public"."boletos" ADD COLUMN "pixReceiverKey" TEXT;

CREATE UNIQUE INDEX "boletos_protocolo_key" ON "public"."boletos"("protocolo");

CREATE UNIQUE INDEX "boletos_solicitacaoTipo_solicitacaoId_key" ON "public"."boletos"("solicitacaoTipo", "solicitacaoId");
