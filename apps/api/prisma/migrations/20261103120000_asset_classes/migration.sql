-- Asset classes: residential, land and commercial (docs/asset-classes.md).
-- Additive except that a property's address, city and ZIP become optional,
-- so a rural parcel identified by APN, county and coordinates can be stored.

-- AlterTable
ALTER TABLE "buyer_candidates" ADD COLUMN     "assetClasses" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "categories" JSONB;

-- AlterTable
ALTER TABLE "buyer_transactions" ADD COLUMN     "acres" DOUBLE PRECISION,
ADD COLUMN     "assetClass" TEXT,
ADD COLUMN     "assetSubtype" TEXT,
ADD COLUMN     "buildingSqft" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "control_plane" ADD COLUMN     "nationwideActivities" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "nationwideAssetClasses" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "document_template_versions" ADD COLUMN     "assetClasses" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "structures" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "properties" ADD COLUMN     "acres" DOUBLE PRECISION,
ADD COLUMN     "assetClass" TEXT,
ADD COLUMN     "assetClassBasis" TEXT,
ADD COLUMN     "assetClassConfidence" TEXT,
ADD COLUMN     "assetClassReasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "assetClassSetAt" TIMESTAMP(3),
ADD COLUMN     "assetClassSetBy" TEXT,
ADD COLUMN     "assetSubtype" TEXT,
ADD COLUMN     "buildingSqft" DOUBLE PRECISION,
ADD COLUMN     "improvementValue" DOUBLE PRECISION,
ADD COLUMN     "landUse" TEXT,
ADD COLUMN     "parcelKey" TEXT,
ADD COLUMN     "units" INTEGER,
ADD COLUMN     "zoning" TEXT,
ALTER COLUMN "address" DROP NOT NULL,
ALTER COLUMN "city" DROP NOT NULL,
ALTER COLUMN "zip" DROP NOT NULL;

-- AlterTable
ALTER TABLE "recorded_sales" ADD COLUMN     "acres" DOUBLE PRECISION,
ADD COLUMN     "assetClass" TEXT,
ADD COLUMN     "assetSubtype" TEXT,
ADD COLUMN     "buildingSqft" DOUBLE PRECISION,
ADD COLUMN     "landUse" TEXT,
ADD COLUMN     "units" INTEGER,
ADD COLUMN     "zoning" TEXT;

-- AlterTable
ALTER TABLE "sourcing_markets" ADD COLUMN     "assetClasses" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "underwriting_results" ADD COLUMN     "analysis" JSONB,
ADD COLUMN     "assetClass" TEXT,
ADD COLUMN     "strategy" TEXT;

-- CreateTable
CREATE TABLE "property_facts" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB,
    "status" TEXT NOT NULL,
    "source" TEXT,
    "sourceUrl" TEXT,
    "documentId" TEXT,
    "note" TEXT,
    "observedAt" TIMESTAMP(3),
    "recordedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_facts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_code_mappings" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "county" TEXT NOT NULL DEFAULT '',
    "provider" TEXT NOT NULL DEFAULT '',
    "code" TEXT NOT NULL,
    "assetClass" TEXT NOT NULL,
    "assetSubtype" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_code_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "property_facts_accountId_key_idx" ON "property_facts"("accountId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "property_facts_propertyId_key_key" ON "property_facts"("propertyId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "asset_code_mappings_accountId_state_county_provider_code_key" ON "asset_code_mappings"("accountId", "state", "county", "provider", "code");

-- CreateIndex
CREATE INDEX "properties_accountId_parcelKey_idx" ON "properties"("accountId", "parcelKey");

-- CreateIndex
CREATE INDEX "properties_accountId_assetClass_idx" ON "properties"("accountId", "assetClass");

-- AddForeignKey
ALTER TABLE "property_facts" ADD CONSTRAINT "property_facts_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Records made before asset classes existed were residential by design:
-- sourcing markets pulled houses and the templates were written for them.
UPDATE "sourcing_markets" SET "assetClasses" = ARRAY['residential']::TEXT[] WHERE cardinality("assetClasses") = 0;
UPDATE "document_template_versions" SET "assetClasses" = ARRAY['residential']::TEXT[] WHERE cardinality("assetClasses") = 0;

-- Existing properties are classified only where the provider's label says
-- plainly what they are (the same label rules as packages/shared/src/assets/
-- classify.ts). Anything else stays unclassified for a person to confirm.
UPDATE "properties" SET
  "assetClass" = 'residential',
  "assetSubtype" = CASE
    WHEN upper("propertyType") ~ '(DUPLEX|TRIPLEX|QUADRUPLEX|QUADPLEX|FOURPLEX|FOUR.?PLEX)' THEN 'small_multifamily'
    WHEN upper("propertyType") ~ '(MOBILE|MANUFACTURED)' THEN 'manufactured'
    WHEN upper("propertyType") ~ '(CONDO|TOWNHOUSE|TOWNHOME|ROWHOUSE)' THEN 'condo_townhome'
    ELSE 'single_family'
  END,
  "assetClassBasis" = 'rules',
  "assetClassConfidence" = 'medium',
  "assetClassReasons" = ARRAY['labelled "' || "propertyType" || '"', 'classified when asset classes were introduced']
WHERE "assetClass" IS NULL
  AND "propertyType" IS NOT NULL
  AND upper("propertyType") ~ '(^SFR$|SINGLE.?FAMILY|CONDO|TOWNHOUSE|TOWNHOME|ROWHOUSE|DUPLEX|TRIPLEX|QUADRUPLEX|QUADPLEX|FOURPLEX|MOBILE HOME|MANUFACTURED)'
  AND upper("propertyType") !~ '(VACANT|LAND|LOT|COMMERCIAL|APARTMENT)';

-- The parcel identity used to dedupe across sources (parcelKey() in
-- packages/shared/src/assets/parcel.ts): STATE|county|APN, normalized.
UPDATE "properties" SET "parcelKey" =
  upper("state") || '|' ||
  regexp_replace(regexp_replace(lower(trim("county")), '\s+(county|parish|borough)$', ''), '[^a-z0-9]', '', 'g') || '|' ||
  regexp_replace(upper("apn"), '[^A-Z0-9]', '', 'g')
WHERE "apn" IS NOT NULL AND "county" IS NOT NULL AND "parcelKey" IS NULL
  AND regexp_replace(upper("apn"), '[^A-Z0-9]', '', 'g') <> '';
