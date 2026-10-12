-- CreateTable
CREATE TABLE "sourcing_markets" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "city" TEXT,
    "postalCode" TEXT,
    "sources" TEXT[],
    "criteria" JSONB,
    "cadence" TEXT NOT NULL DEFAULT 'daily',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "nextRunAt" TIMESTAMP(3),
    "lastRunAt" TIMESTAMP(3),
    "lastResult" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sourcing_markets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sourcing_markets_enabled_nextRunAt_idx" ON "sourcing_markets"("enabled", "nextRunAt");

-- CreateIndex
CREATE INDEX "sourcing_markets_accountId_createdAt_idx" ON "sourcing_markets"("accountId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "sourcing_markets_accountId_label_key" ON "sourcing_markets"("accountId", "label");
