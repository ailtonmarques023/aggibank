-- Fatia 5 — KYC documental (modelos apenas). Fonte da verdade: identity_submissions.
-- User.isVerificado permanece apenas e-mail. Denormalização em usuarios apenas leitura operacional/gates futuros.

-- CreateEnum
CREATE TYPE "IdentityReviewStatus" AS ENUM ('NONE', 'NOT_STARTED', 'PENDING', 'APPROVED', 'REJECTED_RESUBMISSION');

-- CreateEnum
CREATE TYPE "IdentitySubmissionStatus" AS ENUM ('DRAFT', 'PENDING_UPLOADS', 'READY_FOR_REVIEW', 'UNDER_MANUAL_REVIEW', 'APPROVED', 'REJECTED', 'RESUBMISSION_REQUIRED');

-- CreateEnum
CREATE TYPE "IdentityArtifactType" AS ENUM ('DOCUMENT_FRONT', 'DOCUMENT_BACK', 'SELFIE_PORTRAIT');

-- CreateEnum
CREATE TYPE "IdentityArtifactUploadStatus" AS ENUM ('AWAITING_UPLOAD', 'UPLOAD_CONFIRMED', 'QUARANTINED', 'DELETED_AFTER_POLICY');

-- CreateTable
CREATE TABLE "identity_submissions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "IdentitySubmissionStatus" NOT NULL DEFAULT 'DRAFT',
    "versionOrAttempt" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "submittedForReviewAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "decisionActorType" TEXT,
    "decisionActorId" TEXT,
    "rejectReasonCode" TEXT,
    "userFacingMessageSanitized" TEXT,

    CONSTRAINT "identity_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity_submission_artifacts" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "type" "IdentityArtifactType" NOT NULL,
    "uploadStatus" "IdentityArtifactUploadStatus" NOT NULL DEFAULT 'AWAITING_UPLOAD',
    "bucket" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "storageProvider" TEXT NOT NULL DEFAULT 'S3_COMPAT',
    "mimeType" TEXT,
    "byteSize" INTEGER,
    "checksumSHA256" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "identity_submission_artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "identity_submission_artifacts_objectKey_key" ON "identity_submission_artifacts"("objectKey");

-- CreateIndex
CREATE INDEX "identity_submissions_userId_createdAt_idx" ON "identity_submissions"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "identity_submissions_userId_status_createdAt_idx" ON "identity_submissions"("userId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "identity_submissions_status_submittedForReviewAt_idx" ON "identity_submissions"("status", "submittedForReviewAt");

-- CreateIndex
CREATE INDEX "identity_submission_artifacts_submissionId_type_idx" ON "identity_submission_artifacts"("submissionId", "type");

-- AddForeignKey
ALTER TABLE "identity_submissions" ADD CONSTRAINT "identity_submissions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity_submission_artifacts" ADD CONSTRAINT "identity_submission_artifacts_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "identity_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable usuarios (colunas opcionais de identidade administrativa/gates futuros — não equivalem a verificação de e-mail).
ALTER TABLE "usuarios" ADD COLUMN "identityReviewStatus" "IdentityReviewStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN "identityApprovedAt" TIMESTAMP(3),
ADD COLUMN "lastIdentitySubmissionId" TEXT;

CREATE UNIQUE INDEX "usuarios_lastIdentitySubmissionId_key" ON "usuarios"("lastIdentitySubmissionId");

ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_lastIdentitySubmissionId_fkey" FOREIGN KEY ("lastIdentitySubmissionId") REFERENCES "identity_submissions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
