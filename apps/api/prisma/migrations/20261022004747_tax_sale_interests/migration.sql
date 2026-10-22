-- AlterTable
ALTER TABLE "deals" ADD COLUMN     "acquisitionType" TEXT NOT NULL DEFAULT 'standard';

-- CreateTable
CREATE TABLE "tax_sale_interests" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "interestType" TEXT NOT NULL DEFAULT 'unknown',
    "county" TEXT,
    "auctionDate" TIMESTAMP(3),
    "advertisedPrice" DOUBLE PRECISION,
    "winningBid" DOUBLE PRECISION,
    "redemptionEndsAt" TIMESTAMP(3),
    "redeemed" BOOLEAN NOT NULL DEFAULT false,
    "titleStatus" TEXT NOT NULL DEFAULT 'unverified',
    "transferable" TEXT NOT NULL DEFAULT 'unknown',
    "evidenceDocumentId" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "verifiedBy" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_sale_interests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tax_sale_interests_dealId_key" ON "tax_sale_interests"("dealId");

-- CreateIndex
CREATE INDEX "tax_sale_interests_accountId_idx" ON "tax_sale_interests"("accountId");

-- AddForeignKey
ALTER TABLE "tax_sale_interests" ADD CONSTRAINT "tax_sale_interests_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
