-- F1: proposta temporária de abertura de conta (aditivo; sem alterar modelos financeiros existentes)

CREATE TYPE "AccountApplicationStatus" AS ENUM (
  'DRAFT',
  'DATA_RECEIVED',
  'DOCUMENTS_PENDING',
  'READY_TO_FINALIZE',
  'FINALIZED',
  'EXPIRED',
  'CANCELLED'
);

CREATE TABLE "account_applications" (
  "id" TEXT NOT NULL,
  "status" "AccountApplicationStatus" NOT NULL DEFAULT 'DRAFT',
  "protocolNumber" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "nomeCompleto" TEXT,
  "email" TEXT,
  "cpf" TEXT,
  "telefone" TEXT,
  "dataNascimento" TIMESTAMP(3),
  "senhaHash" TEXT,
  "aceitaTermos" BOOLEAN NOT NULL DEFAULT false,
  "aceitaComunicacoes" BOOLEAN NOT NULL DEFAULT false,
  "enderecoJson" JSONB,
  "dadosProfissionaisJson" JSONB,
  "finalizedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "account_applications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "account_applications_protocolNumber_key" ON "account_applications"("protocolNumber");
CREATE INDEX "account_applications_status_createdAt_idx" ON "account_applications"("status", "createdAt");
CREATE INDEX "account_applications_tokenHash_idx" ON "account_applications"("tokenHash");
CREATE INDEX "account_applications_cpf_status_idx" ON "account_applications"("cpf", "status");
CREATE INDEX "account_applications_email_status_idx" ON "account_applications"("email", "status");
