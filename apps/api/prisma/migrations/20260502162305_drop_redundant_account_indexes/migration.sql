-- Drop single-column (accountId) indexes that are now redundant: each is the
-- leftmost prefix of an (accountId, ...) composite index added by the
-- 20260502150215_perf_indexes migration. Postgres can serve the same lookup
-- via the composite, so the standalone index just costs write amplification
-- on every insert/update.
--
-- NOTE: the trgm GIN indexes (leads_canonicalAddress_trgm_idx,
-- leads_canonicalOwner_trgm_idx, properties_address_trgm_idx) and the
-- pg_trgm extension live outside the Prisma schema (they're applied via raw
-- SQL in the prior migration), so Prisma introspection wanted to drop them
-- here. Those DROP statements have been intentionally removed - the trgm
-- indexes power /leads search and CSV-import dedup and must stay.

-- DropIndex
DROP INDEX "ai_cost_logs_accountId_idx";

-- DropIndex
DROP INDEX "buyers_accountId_idx";

-- DropIndex
DROP INDEX "deals_accountId_idx";

-- DropIndex
DROP INDEX "leads_accountId_idx";

-- DropIndex
DROP INDEX "messages_accountId_idx";

-- DropIndex
DROP INDEX "properties_accountId_idx";
