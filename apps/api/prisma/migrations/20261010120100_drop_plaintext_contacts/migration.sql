-- Messaging compliance / PII audit (2026-10-10), cutover half: drop the
-- plaintext contact columns on buyers, dnc_list and consents, leaving
-- envelope ciphertext + blind index only (docs/pii-encryption-design.md).
--
-- Encrypting needs the application's keys, so it cannot happen in SQL. Run
-- `npm run db:backfill-pii` between the previous migration and this one.
-- This migration refuses to run while any row still holds plaintext with no
-- ciphertext, so an un-backfilled database cannot lose data here. If
-- `prisma migrate deploy` stops on it: run the backfill, then
-- `npx prisma migrate resolve --rolled-back 20261010120100_drop_plaintext_contacts`
-- and deploy again.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "buyers"
    WHERE ("email" IS NOT NULL AND "emailEnc" IS NULL)
       OR ("phone" IS NOT NULL AND "phoneEnc" IS NULL)
  ) OR EXISTS (
    SELECT 1 FROM "dnc_list"
    WHERE "phone" IS NOT NULL AND ("phoneEnc" IS NULL OR "phoneHash" IS NULL)
  ) OR EXISTS (
    SELECT 1 FROM "consents"
    WHERE ("phone" IS NOT NULL AND "phoneEnc" IS NULL)
       OR ("email" IS NOT NULL AND "emailEnc" IS NULL)
  ) THEN
    RAISE EXCEPTION 'buyers, dnc_list or consents still have unprotected contact fields; run `npm run db:backfill-pii` before applying this migration';
  END IF;
END $$;

-- One DNC row per tenant and phone. Rows that differed only in formatting
-- ("+15125550100" vs "(512) 555-0100") share a blind index, and the unique
-- key moves from the plaintext to the hash. Keep the row that suppresses
-- longest (permanent, else the latest expiry), so what is blocked does not
-- change.
DELETE FROM "dnc_list" d
USING (
  SELECT "id",
         ROW_NUMBER() OVER (
           PARTITION BY "accountId", "phoneHash"
           ORDER BY ("expiresAt" IS NULL) DESC, "expiresAt" DESC, "createdAt" ASC, "id" ASC
         ) AS rn
  FROM "dnc_list"
  WHERE "phoneHash" IS NOT NULL
) ranked
WHERE d."id" = ranked."id" AND ranked.rn > 1;

DROP INDEX IF EXISTS "dnc_list_accountId_phone_key";
DROP INDEX IF EXISTS "dnc_list_phone_idx";
DROP INDEX IF EXISTS "dnc_list_accountId_phoneHash_idx";
ALTER TABLE "dnc_list" DROP COLUMN "phone";
CREATE UNIQUE INDEX "dnc_list_accountId_phoneHash_key" ON "dnc_list"("accountId", "phoneHash");
-- An entry that names no contact would suppress nothing.
ALTER TABLE "dnc_list" ADD CONSTRAINT "dnc_list_contact_present"
  CHECK ("phoneHash" IS NOT NULL OR "emailHash" IS NOT NULL);

DROP INDEX IF EXISTS "consents_phone_idx";
DROP INDEX IF EXISTS "consents_email_idx";
ALTER TABLE "consents" DROP COLUMN "phone";
ALTER TABLE "consents" DROP COLUMN "email";

ALTER TABLE "buyers" DROP COLUMN "email";
ALTER TABLE "buyers" DROP COLUMN "phone";
