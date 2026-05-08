-- Saldo bloqueado (separado do saldo disponível para uso)
ALTER TABLE "public"."usuarios" ADD COLUMN "saldoBloqueado" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- Proposta / crédito: seguro, garantia e status do valor
ALTER TABLE "public"."emprestimos" ADD COLUMN "insuranceSelected" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "public"."emprestimos" ADD COLUMN "insuranceAmount" DECIMAL(10,2);
ALTER TABLE "public"."emprestimos" ADD COLUMN "insuranceTermsAccepted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "public"."emprestimos" ADD COLUMN "fundsStatus" TEXT;
ALTER TABLE "public"."emprestimos" ADD COLUMN "blockedAmount" DECIMAL(10,2);
ALTER TABLE "public"."emprestimos" ADD COLUMN "guaranteeStatus" TEXT NOT NULL DEFAULT 'not_required';
ALTER TABLE "public"."emprestimos" ADD COLUMN "insuranceChargeStatus" TEXT;

-- Cobrança única de seguro por empréstimo
CREATE TABLE "public"."loan_insurance_charges" (
    "id" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "loan_insurance_charges_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "loan_insurance_charges_loanId_key" ON "public"."loan_insurance_charges"("loanId");
CREATE UNIQUE INDEX "loan_insurance_charges_idempotencyKey_key" ON "public"."loan_insurance_charges"("idempotencyKey");
CREATE INDEX "loan_insurance_charges_userId_idx" ON "public"."loan_insurance_charges"("userId");

ALTER TABLE "public"."loan_insurance_charges" ADD CONSTRAINT "loan_insurance_charges_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "public"."emprestimos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."loan_insurance_charges" ADD CONSTRAINT "loan_insurance_charges_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
