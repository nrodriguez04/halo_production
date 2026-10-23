-- AlterTable
ALTER TABLE "document_template_versions" ADD COLUMN     "acceptanceReason" TEXT,
ADD COLUMN     "acceptedByName" TEXT,
ADD COLUMN     "approvalBasis" TEXT;

-- AlterTable
ALTER TABLE "market_policy_versions" ADD COLUMN     "acceptanceReason" TEXT,
ADD COLUMN     "acceptedByName" TEXT,
ADD COLUMN     "basis" TEXT NOT NULL DEFAULT 'counsel',
ALTER COLUMN "counselName" DROP NOT NULL,
ALTER COLUMN "memoDocumentId" DROP NOT NULL;

-- Every template approved before this migration was approved on counsel's advice.
UPDATE "document_template_versions" SET "approvalBasis" = 'counsel' WHERE "approvedAt" IS NOT NULL;
