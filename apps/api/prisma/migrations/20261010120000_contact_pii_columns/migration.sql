-- Messaging compliance / PII audit (2026-10-10), additive half.
--
-- buyers get envelope-ciphertext + blind-index contact columns, as leads,
-- dnc_list and consents already have. dnc_list also gains an email
-- identifier (DNC now applies to email; unsubscribe links write here) and
-- its phone becomes optional, since an entry may name only an email.
--
-- Nothing is dropped and no existing column is read differently, so the
-- previous release keeps working against this schema. Run
-- `npm run db:backfill-pii` after this migration: it encrypts every
-- remaining plaintext contact. The next migration drops the plaintext
-- columns and refuses to run until the backfill has.
ALTER TABLE "buyers" ADD COLUMN "emailEnc" TEXT;
ALTER TABLE "buyers" ADD COLUMN "emailHash" TEXT;
ALTER TABLE "buyers" ADD COLUMN "phoneEnc" TEXT;
ALTER TABLE "buyers" ADD COLUMN "phoneHash" TEXT;
CREATE INDEX "buyers_accountId_emailHash_idx" ON "buyers"("accountId", "emailHash");
CREATE INDEX "buyers_accountId_phoneHash_idx" ON "buyers"("accountId", "phoneHash");

ALTER TABLE "dnc_list" ADD COLUMN "emailEnc" TEXT;
ALTER TABLE "dnc_list" ADD COLUMN "emailHash" TEXT;
ALTER TABLE "dnc_list" ALTER COLUMN "phone" DROP NOT NULL;
CREATE UNIQUE INDEX "dnc_list_accountId_emailHash_key" ON "dnc_list"("accountId", "emailHash");
