-- AlterTable
ALTER TABLE "properties" ADD COLUMN     "absentee" BOOLEAN,
ADD COLUMN     "assessedValue" DOUBLE PRECISION,
ADD COLUMN     "baths" DOUBLE PRECISION,
ADD COLUMN     "beds" DOUBLE PRECISION,
ADD COLUMN     "county" TEXT,
ADD COLUMN     "countyFips" TEXT,
ADD COLUMN     "dataQuality" TEXT,
ADD COLUMN     "dataSource" TEXT,
ADD COLUMN     "dataSourceRef" TEXT,
ADD COLUMN     "dataUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "lastSaleDate" TIMESTAMP(3),
ADD COLUMN     "lastSalePrice" DOUBLE PRECISION,
ADD COLUMN     "lotSqft" DOUBLE PRECISION,
ADD COLUMN     "ownerKind" TEXT,
ADD COLUMN     "propertyType" TEXT,
ADD COLUMN     "sqft" DOUBLE PRECISION,
ADD COLUMN     "yearBuilt" INTEGER;

-- CreateTable
CREATE TABLE "recorded_sales" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceRef" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "county" TEXT,
    "countyFips" TEXT,
    "city" TEXT,
    "zip" TEXT,
    "address" TEXT,
    "apn" TEXT,
    "saleDate" TIMESTAMP(3) NOT NULL,
    "price" DOUBLE PRECISION,
    "buyerName" TEXT,
    "buyerKind" TEXT,
    "buyerKey" TEXT,
    "buyerMailingZip" TEXT,
    "sellerName" TEXT,
    "sellerKind" TEXT,
    "sellerKey" TEXT,
    "cashPurchase" BOOLEAN,
    "armsLength" BOOLEAN,
    "deedType" TEXT,
    "propertyType" TEXT,
    "quality" TEXT NOT NULL DEFAULT 'recorded',
    "importId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recorded_sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_imports" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "documentId" TEXT,
    "state" TEXT,
    "county" TEXT,
    "params" JSONB,
    "rows" INTEGER NOT NULL DEFAULT 0,
    "imported" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "data_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "buyer_candidates" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "mailingZip" TEXT,
    "purchaseCount" INTEGER NOT NULL,
    "cashPurchases" INTEGER NOT NULL,
    "financedPurchases" INTEGER NOT NULL,
    "resales" INTEGER NOT NULL,
    "medianHoldDays" DOUBLE PRECISION,
    "firstPurchase" TIMESTAMP(3) NOT NULL,
    "lastPurchase" TIMESTAMP(3) NOT NULL,
    "states" TEXT[],
    "buyBox" JSONB NOT NULL,
    "purchases" JSONB NOT NULL,
    "score" INTEGER NOT NULL,
    "reasons" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'candidate',
    "buyerId" TEXT,
    "dismissedReason" TEXT,
    "refreshedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "buyer_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recorded_sales_accountId_state_saleDate_idx" ON "recorded_sales"("accountId", "state", "saleDate");

-- CreateIndex
CREATE INDEX "recorded_sales_accountId_buyerKey_idx" ON "recorded_sales"("accountId", "buyerKey");

-- CreateIndex
CREATE INDEX "recorded_sales_accountId_countyFips_idx" ON "recorded_sales"("accountId", "countyFips");

-- CreateIndex
CREATE INDEX "recorded_sales_accountId_zip_idx" ON "recorded_sales"("accountId", "zip");

-- CreateIndex
CREATE UNIQUE INDEX "recorded_sales_accountId_source_sourceRef_key" ON "recorded_sales"("accountId", "source", "sourceRef");

-- CreateIndex
CREATE INDEX "data_imports_accountId_createdAt_idx" ON "data_imports"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "buyer_candidates_accountId_status_score_idx" ON "buyer_candidates"("accountId", "status", "score");

-- CreateIndex
CREATE UNIQUE INDEX "buyer_candidates_accountId_key_key" ON "buyer_candidates"("accountId", "key");

-- CreateIndex
CREATE INDEX "properties_accountId_countyFips_idx" ON "properties"("accountId", "countyFips");
