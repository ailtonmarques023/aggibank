-- Fatia 4: vínculo proposta → User após finalize.

ALTER TABLE "account_applications" ADD COLUMN "userId" TEXT;

CREATE UNIQUE INDEX "account_applications_userId_key" ON "account_applications"("userId");

ALTER TABLE "account_applications"
  ADD CONSTRAINT "account_applications_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "usuarios"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
