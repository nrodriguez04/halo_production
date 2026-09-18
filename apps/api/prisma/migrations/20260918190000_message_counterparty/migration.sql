-- Phase 2 of PII encryption: the external party on a message moves out of
-- metadata JSON into an encrypted column with a blind index. Additive; the
-- backfill (npm run db:backfill-pii) fills the columns and strips the
-- plaintext keys from metadata on existing rows.
ALTER TABLE "messages" ADD COLUMN "counterpartyEnc" TEXT;
ALTER TABLE "messages" ADD COLUMN "counterpartyHash" TEXT;
CREATE INDEX "messages_accountId_counterpartyHash_idx" ON "messages"("accountId", "counterpartyHash");
