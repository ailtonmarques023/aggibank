-- Fatia 2: KYC da proposta — IdentitySubmission pertence a User OU AccountApplication (XOR).

ALTER TABLE "identity_submissions" ADD COLUMN "accountApplicationId" TEXT;

ALTER TABLE "identity_submissions" ALTER COLUMN "userId" DROP NOT NULL;

ALTER TABLE "identity_submissions"
  ADD CONSTRAINT "identity_submissions_accountApplicationId_fkey"
  FOREIGN KEY ("accountApplicationId") REFERENCES "account_applications"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "identity_submissions_accountApplicationId_createdAt_idx"
  ON "identity_submissions"("accountApplicationId", "createdAt");

CREATE INDEX "identity_submissions_accountApplicationId_status_createdAt_idx"
  ON "identity_submissions"("accountApplicationId", "status", "createdAt");

ALTER TABLE "identity_submissions"
  ADD CONSTRAINT "identity_submission_owner_xor"
  CHECK (
    ("userId" IS NOT NULL AND "accountApplicationId" IS NULL)
    OR ("userId" IS NULL AND "accountApplicationId" IS NOT NULL)
  );
