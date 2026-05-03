-- AlterTable: snapshot seguro da solicitacao + consentimento LGPD (nullable, retrocompativel)
ALTER TABLE "public"."cartoes" ADD COLUMN     "dadosSolicitacao" JSONB;
ALTER TABLE "public"."cartoes" ADD COLUMN     "lgpdConsentAt" TIMESTAMP(3);
ALTER TABLE "public"."cartoes" ADD COLUMN     "lgpdConsentVersion" TEXT;
