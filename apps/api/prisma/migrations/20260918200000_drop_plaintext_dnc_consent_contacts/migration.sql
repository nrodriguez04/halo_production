-- PII phase 2 cutover for dnc_list and consents: drop the plaintext contact
-- columns. Refuses to run while any row still has a plaintext value with no
-- ciphertext, so an un-backfilled database cannot lose data here.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "dnc_list" WHERE "phone" IS NOT NULL AND "phoneEnc" IS NULL)
  OR EXISTS (
    SELECT 1 FROM "consents"
    WHERE ("phone" IS NOT NULL AND "phoneEnc" IS NULL)
       OR ("email" IS NOT NULL AND "emailEnc" IS NULL)
  ) THEN
    RAISE EXCEPTION 'dnc_list/consents still have unprotected contact fields; run `npm run db:backfill-pii` before applying this migration';
  END IF;
END $$;

-- dnc_list: every row has a number, so the protected columns become NOT NULL
-- and the tenant uniqueness moves to the blind index.
ALTER TABLE "dnc_list" DROP COLUMN "phone";
ALTER TABLE "dnc_list" ALTER COLUMN "phoneEnc" SET NOT NULL;
ALTER TABLE "dnc_list" ALTER COLUMN "phoneHash" SET NOT NULL;
DROP INDEX IF EXISTS "dnc_list_accountId_phoneHash_idx";
CREATE UNIQUE INDEX "dnc_list_accountId_phoneHash_key" ON "dnc_list"("accountId", "phoneHash");

ALTER TABLE "consents" DROP COLUMN "phone";
ALTER TABLE "consents" DROP COLUMN "email";
