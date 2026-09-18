-- Phase 1 of PII encryption (docs/pii-encryption-design.md): additive columns
-- for encrypted phone/email plus blind-index hashes. Plaintext columns stay
-- until the backfill has run and lookups have moved; no data is changed here.
ALTER TABLE "leads" ADD COLUMN "canonicalPhoneEnc" TEXT;
ALTER TABLE "leads" ADD COLUMN "canonicalEmailEnc" TEXT;
ALTER TABLE "leads" ADD COLUMN "canonicalPhoneHash" TEXT;
ALTER TABLE "leads" ADD COLUMN "canonicalEmailHash" TEXT;

CREATE INDEX "leads_accountId_canonicalPhoneHash_idx" ON "leads"("accountId", "canonicalPhoneHash");
CREATE INDEX "leads_accountId_canonicalEmailHash_idx" ON "leads"("accountId", "canonicalEmailHash");
