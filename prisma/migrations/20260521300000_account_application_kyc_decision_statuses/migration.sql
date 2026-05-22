-- Fatia 3: status de proposta após decisão interna de KYC.

ALTER TYPE "AccountApplicationStatus" ADD VALUE 'DOCUMENTS_APPROVED';
ALTER TYPE "AccountApplicationStatus" ADD VALUE 'RESUBMISSION_REQUIRED';
ALTER TYPE "AccountApplicationStatus" ADD VALUE 'REJECTED';
