-- PII cutover (docs/pii-encryption-design.md): drop the plaintext contact
-- columns. Refuses to run while any lead still has a plaintext value with no
-- ciphertext, so an un-backfilled database cannot lose data here.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "leads"
    WHERE ("canonicalPhone" IS NOT NULL AND "canonicalPhoneEnc" IS NULL)
       OR ("canonicalEmail" IS NOT NULL AND "canonicalEmailEnc" IS NULL)
  ) THEN
    RAISE EXCEPTION 'leads still have unprotected contact fields; run `npm run db:backfill-pii` before applying this migration';
  END IF;
END $$;

ALTER TABLE "leads" DROP COLUMN "canonicalPhone";
ALTER TABLE "leads" DROP COLUMN "canonicalEmail";
