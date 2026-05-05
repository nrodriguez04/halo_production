-- CreateTable
CREATE TABLE "integration_providers" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "isFallbackFor" TEXT,
    "defaultCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rateLimitPerMin" INTEGER,
    "concurrencyLimit" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_pricing_rules" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "unitCostUsd" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "pricePer" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "provider_pricing_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_rate_limits" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "windowSec" INTEGER NOT NULL,
    "maxRequests" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "provider_rate_limits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_budget_buckets" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "scopeRef" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "hardCapUsd" DOUBLE PRECISION NOT NULL,
    "softCapUsd" DOUBLE PRECISION,
    "currentSpendUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "periodStartedAt" TIMESTAMP(3) NOT NULL,
    "periodResetsAt" TIMESTAMP(3) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_budget_buckets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_cost_events" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "providerKey" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "estimatedCostUsd" DOUBLE PRECISION NOT NULL,
    "actualCostUsd" DOUBLE PRECISION,
    "status" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "durationMs" INTEGER,
    "responseCode" INTEGER,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "leadId" TEXT,
    "propertyId" TEXT,
    "dealId" TEXT,
    "campaignId" TEXT,
    "automationRunId" TEXT,
    "actor" TEXT NOT NULL,
    "userId" TEXT,
    "metadata" JSONB,
    "bucketIds" TEXT[],
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "integration_cost_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_usage_aggregates" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerKey" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "callCount" INTEGER NOT NULL DEFAULT 0,
    "totalCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cacheHits" INTEGER NOT NULL DEFAULT 0,
    "errors" INTEGER NOT NULL DEFAULT 0,
    "rateLimited" INTEGER NOT NULL DEFAULT 0,
    "costSavedUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_usage_aggregates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_feature_flags" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "flag" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "enabledAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_feature_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manual_budget_overrides" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "scopeRef" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "approvedBy" TEXT NOT NULL,
    "extraBudgetUsd" DOUBLE PRECISION NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "manual_budget_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cached_provider_responses" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerKey" TEXT NOT NULL,
    "cacheKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "responseCode" INTEGER,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "hitCount" INTEGER NOT NULL DEFAULT 0,
    "costSavedUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "cached_provider_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_enrichment_jobs" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "rejectedReason" TEXT,
    "totalCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "metadata" JSONB,

    CONSTRAINT "lead_enrichment_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "integration_providers_key_key" ON "integration_providers"("key");

-- CreateIndex
CREATE INDEX "provider_pricing_rules_providerId_action_effectiveAt_idx" ON "provider_pricing_rules"("providerId", "action", "effectiveAt");

-- CreateIndex
CREATE UNIQUE INDEX "provider_rate_limits_providerId_scope_windowSec_key" ON "provider_rate_limits"("providerId", "scope", "windowSec");

-- CreateIndex
CREATE INDEX "integration_budget_buckets_accountId_periodResetsAt_idx" ON "integration_budget_buckets"("accountId", "periodResetsAt");

-- CreateIndex
CREATE INDEX "integration_budget_buckets_accountId_scope_scopeRef_period_idx" ON "integration_budget_buckets"("accountId", "scope", "scopeRef", "period");

-- CreateIndex
CREATE UNIQUE INDEX "integration_budget_buckets_accountId_scope_scopeRef_period__key" ON "integration_budget_buckets"("accountId", "scope", "scopeRef", "period", "periodStartedAt");

-- CreateIndex
CREATE UNIQUE INDEX "integration_cost_events_reservationId_key" ON "integration_cost_events"("reservationId");

-- CreateIndex
CREATE INDEX "integration_cost_events_accountId_createdAt_idx" ON "integration_cost_events"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "integration_cost_events_accountId_providerKey_createdAt_idx" ON "integration_cost_events"("accountId", "providerKey", "createdAt");

-- CreateIndex
CREATE INDEX "integration_cost_events_accountId_leadId_idx" ON "integration_cost_events"("accountId", "leadId");

-- CreateIndex
CREATE INDEX "integration_cost_events_accountId_automationRunId_idx" ON "integration_cost_events"("accountId", "automationRunId");

-- CreateIndex
CREATE INDEX "integration_cost_events_idempotencyKey_createdAt_idx" ON "integration_cost_events"("idempotencyKey", "createdAt");

-- CreateIndex
CREATE INDEX "integration_usage_aggregates_accountId_period_periodKey_idx" ON "integration_usage_aggregates"("accountId", "period", "periodKey");

-- CreateIndex
CREATE UNIQUE INDEX "integration_usage_aggregates_accountId_providerKey_action_p_key" ON "integration_usage_aggregates"("accountId", "providerKey", "action", "period", "periodKey");

-- CreateIndex
CREATE INDEX "integration_feature_flags_accountId_enabled_idx" ON "integration_feature_flags"("accountId", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "integration_feature_flags_accountId_flag_key" ON "integration_feature_flags"("accountId", "flag");

-- CreateIndex
CREATE INDEX "manual_budget_overrides_accountId_scope_scopeRef_expiresAt_idx" ON "manual_budget_overrides"("accountId", "scope", "scopeRef", "expiresAt");

-- CreateIndex
CREATE INDEX "cached_provider_responses_accountId_providerKey_expiresAt_idx" ON "cached_provider_responses"("accountId", "providerKey", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "cached_provider_responses_accountId_providerKey_cacheKey_key" ON "cached_provider_responses"("accountId", "providerKey", "cacheKey");

-- CreateIndex
CREATE INDEX "lead_enrichment_jobs_accountId_stage_idx" ON "lead_enrichment_jobs"("accountId", "stage");

-- CreateIndex
CREATE INDEX "lead_enrichment_jobs_leadId_idx" ON "lead_enrichment_jobs"("leadId");

-- AddForeignKey
ALTER TABLE "provider_pricing_rules" ADD CONSTRAINT "provider_pricing_rules_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "integration_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_rate_limits" ADD CONSTRAINT "provider_rate_limits_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "integration_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_cost_events" ADD CONSTRAINT "integration_cost_events_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "integration_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
