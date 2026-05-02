-- CreateIndex
CREATE INDEX "ai_cost_logs_accountId_createdAt_idx" ON "ai_cost_logs"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "buyers_accountId_engagementScore_idx" ON "buyers"("accountId", "engagementScore");

-- CreateIndex
CREATE INDEX "deals_leadId_idx" ON "deals"("leadId");

-- CreateIndex
CREATE INDEX "deals_propertyId_idx" ON "deals"("propertyId");

-- CreateIndex
CREATE INDEX "deals_accountId_createdAt_idx" ON "deals"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "deals_accountId_stage_createdAt_idx" ON "deals"("accountId", "stage", "createdAt");

-- CreateIndex
CREATE INDEX "leads_accountId_createdAt_idx" ON "leads"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "leads_accountId_status_createdAt_idx" ON "leads"("accountId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "messages_dealId_idx" ON "messages"("dealId");

-- CreateIndex
CREATE INDEX "messages_accountId_status_createdAt_idx" ON "messages"("accountId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "messages_accountId_source_status_createdAt_idx" ON "messages"("accountId", "source", "status", "createdAt");

-- CreateIndex
CREATE INDEX "properties_leadId_idx" ON "properties"("leadId");

-- CreateIndex
CREATE INDEX "properties_accountId_createdAt_idx" ON "properties"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "properties_latitude_longitude_idx" ON "properties"("latitude", "longitude");

-- CreateIndex
CREATE INDEX "source_records_provider_requestHash_createdAt_idx" ON "source_records"("provider", "requestHash", "createdAt");

-- Enable trigram extension for fuzzy substring search (CONCURRENTLY-safe; no-op if already enabled)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Trigram GIN indexes power ILIKE/contains searches on address/owner without sequential scans.
-- Used by leads search, CSV import dedup, properties search, and findPotentialDuplicates.
CREATE INDEX IF NOT EXISTS "leads_canonicalAddress_trgm_idx"
  ON "leads" USING GIN ("canonicalAddress" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "leads_canonicalOwner_trgm_idx"
  ON "leads" USING GIN ("canonicalOwner" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "properties_address_trgm_idx"
  ON "properties" USING GIN ("address" gin_trgm_ops);
