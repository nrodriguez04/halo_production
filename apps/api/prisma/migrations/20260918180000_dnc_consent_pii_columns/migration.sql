-- Phase 2 of PII encryption: additive ciphertext + blind-index columns for
-- dnc_list.phone and consents.phone / consents.email. Plaintext stays until
-- the backfill has run; the drop is a later, guarded migration.
ALTER TABLE "dnc_list" ADD COLUMN "phoneEnc" TEXT;
ALTER TABLE "dnc_list" ADD COLUMN "phoneHash" TEXT;
CREATE INDEX "dnc_list_accountId_phoneHash_idx" ON "dnc_list"("accountId", "phoneHash");

ALTER TABLE "consents" ADD COLUMN "phoneEnc" TEXT;
ALTER TABLE "consents" ADD COLUMN "phoneHash" TEXT;
ALTER TABLE "consents" ADD COLUMN "emailEnc" TEXT;
ALTER TABLE "consents" ADD COLUMN "emailHash" TEXT;
CREATE INDEX "consents_accountId_phoneHash_idx" ON "consents"("accountId", "phoneHash");
CREATE INDEX "consents_accountId_emailHash_idx" ON "consents"("accountId", "emailHash");
