-- AlterEnum
ALTER TYPE "TimelineEntityType" ADD VALUE 'BUYER';

-- AlterTable
ALTER TABLE "buyers" ADD COLUMN     "company" TEXT,
ADD COLUMN     "fundingType" TEXT NOT NULL DEFAULT 'unknown',
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "pofAmount" DOUBLE PRECISION,
ADD COLUMN     "pofDocumentId" TEXT,
ADD COLUMN     "pofExpiresAt" TIMESTAMP(3),
ADD COLUMN     "pofStatus" TEXT NOT NULL DEFAULT 'none',
ADD COLUMN     "pofVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "pofVerifiedBy" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'manual',
ADD COLUMN     "sourceDetail" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'active';

-- AlterTable
ALTER TABLE "contracts" ADD COLUMN     "purpose" TEXT;

-- AlterTable
ALTER TABLE "control_plane" ADD COLUMN     "campaignFollowUpDays" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "campaignMaxFollowUps" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "dispositionCosts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "minNetProfit" INTEGER NOT NULL DEFAULT 5000,
ADD COLUMN     "minUnderwritingConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
ADD COLUMN     "requireVerifiedPof" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "revenueRecognition" TEXT NOT NULL DEFAULT 'on_funds_received';

-- AlterTable
ALTER TABLE "deal_economics" ADD COLUMN     "realizedAt" TIMESTAMP(3),
ADD COLUMN     "realizedFee" DOUBLE PRECISION,
ADD COLUMN     "revenueStatus" TEXT NOT NULL DEFAULT 'projected';

-- CreateTable
CREATE TABLE "purchase_agreements" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "contractId" TEXT,
    "executedDocumentId" TEXT,
    "jurisdiction" TEXT,
    "purchasePrice" DOUBLE PRECISION,
    "earnestMoneyAmount" DOUBLE PRECISION,
    "earnestMoneyDueAt" TIMESTAMP(3),
    "earnestMoneyDepositedAt" TIMESTAMP(3),
    "inspectionEndsAt" TIMESTAMP(3),
    "closingDeadline" TIMESTAMP(3),
    "executedAt" TIMESTAMP(3),
    "assignability" TEXT NOT NULL DEFAULT 'unknown',
    "assignmentClause" TEXT,
    "sellerConsentDocumentId" TEXT,
    "sellerAssignmentNotice" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "verifiedBy" TEXT,
    "verification" JSONB,
    "terminatedAt" TIMESTAMP(3),
    "terminationReason" TEXT,
    "notes" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_agreements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jurisdiction_policies" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "assignmentAllowed" TEXT NOT NULL DEFAULT 'unknown',
    "doubleCloseAllowed" TEXT NOT NULL DEFAULT 'unknown',
    "licenseRequired" TEXT NOT NULL DEFAULT 'unknown',
    "licenseDocumentId" TEXT,
    "publicMarketingAllowed" TEXT NOT NULL DEFAULT 'unknown',
    "buyerDisclosureKeys" TEXT[],
    "sellerDisclosureKeys" TEXT[],
    "conditions" TEXT,
    "references" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewExpiresAt" TIMESTAMP(3),
    "notes" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jurisdiction_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "buyer_transactions" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zip" TEXT,
    "propertyType" TEXT,
    "price" DOUBLE PRECISION,
    "closedAt" TIMESTAMP(3),
    "source" TEXT NOT NULL,
    "sourceRef" TEXT,
    "dealId" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "buyer_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deal_packages" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "content" JSONB NOT NULL,
    "askingPrice" DOUBLE PRECISION NOT NULL,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deal_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disposition_campaigns" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "packageId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "askingPrice" DOUBLE PRECISION NOT NULL,
    "floorPrice" DOUBLE PRECISION NOT NULL,
    "pricing" JSONB,
    "channel" TEXT NOT NULL DEFAULT 'email',
    "outreachSubject" TEXT NOT NULL,
    "outreachBody" TEXT NOT NULL,
    "followUpDays" INTEGER NOT NULL DEFAULT 3,
    "maxFollowUps" INTEGER NOT NULL DEFAULT 2,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "launchedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "endedReason" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "disposition_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disposition_targets" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "match" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'selected',
    "shareLinkId" TEXT,
    "lastMessageId" TEXT,
    "contactedAt" TIMESTAMP(3),
    "lastActivityAt" TIMESTAMP(3),
    "followUps" INTEGER NOT NULL DEFAULT 0,
    "skipReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "disposition_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deal_share_links" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "campaignId" TEXT,
    "buyerId" TEXT,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedBy" TEXT,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "firstViewedAt" TIMESTAMP(3),
    "lastViewedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deal_share_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "buyer_offers" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "campaignId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'written_offer',
    "source" TEXT NOT NULL,
    "sourceMessageId" TEXT,
    "capturedBy" TEXT NOT NULL,
    "captureConfidence" DOUBLE PRECISION,
    "confirmedAt" TIMESTAMP(3),
    "confirmedBy" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "earnestMoney" DOUBLE PRECISION,
    "closeBy" TIMESTAMP(3),
    "financing" TEXT,
    "conditions" TEXT,
    "pofProvided" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'received',
    "counterAmount" DOUBLE PRECISION,
    "counteredAt" TIMESTAMP(3),
    "counteredBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decidedBy" TEXT,
    "decisionReason" TEXT,
    "evaluation" JSONB,
    "expiresAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "buyer_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignment_agreements" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "offerId" TEXT,
    "purchaseAgreementId" TEXT NOT NULL,
    "structure" TEXT NOT NULL DEFAULT 'assignment',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "assignmentPrice" DOUBLE PRECISION NOT NULL,
    "assignmentFee" DOUBLE PRECISION NOT NULL,
    "buyerDepositAmount" DOUBLE PRECISION,
    "buyerDepositDueAt" TIMESTAMP(3),
    "buyerDepositReceivedAt" TIMESTAMP(3),
    "contractId" TEXT,
    "executedDocumentId" TEXT,
    "executedAt" TIMESTAMP(3),
    "approvedBy" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "cancelledBy" TEXT,
    "cancellationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assignment_agreements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "closing_files" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "structure" TEXT NOT NULL DEFAULT 'assignment',
    "status" TEXT NOT NULL DEFAULT 'open',
    "titleStatus" TEXT NOT NULL DEFAULT 'not_opened',
    "closingAgentCompany" TEXT,
    "closingAgentOfficer" TEXT,
    "closingAgentEmail" TEXT,
    "closingAgentPhone" TEXT,
    "fileNumber" TEXT,
    "scheduledClosingAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "closedBy" TEXT,
    "settlementDocumentId" TEXT,
    "expectedFee" DOUBLE PRECISION,
    "realizedFee" DOUBLE PRECISION,
    "feeReceivedAt" TIMESTAMP(3),
    "feeRecordedBy" TEXT,
    "revenueRecognizedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelledBy" TEXT,
    "cancellationReason" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "closing_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "closing_milestones" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "closingFileId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "blocking" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "completedBy" TEXT,
    "note" TEXT,
    "evidenceDocumentId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "closing_milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "closing_issues" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "closingFileId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'blocking',
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "raisedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "closing_issues_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "purchase_agreements_contractId_key" ON "purchase_agreements"("contractId");

-- CreateIndex
CREATE INDEX "purchase_agreements_accountId_status_idx" ON "purchase_agreements"("accountId", "status");

-- CreateIndex
CREATE INDEX "purchase_agreements_dealId_idx" ON "purchase_agreements"("dealId");

-- CreateIndex
CREATE INDEX "purchase_agreements_accountId_closingDeadline_idx" ON "purchase_agreements"("accountId", "closingDeadline");

-- CreateIndex
CREATE UNIQUE INDEX "jurisdiction_policies_accountId_state_key" ON "jurisdiction_policies"("accountId", "state");

-- CreateIndex
CREATE INDEX "buyer_transactions_accountId_state_city_idx" ON "buyer_transactions"("accountId", "state", "city");

-- CreateIndex
CREATE INDEX "buyer_transactions_accountId_zip_idx" ON "buyer_transactions"("accountId", "zip");

-- CreateIndex
CREATE INDEX "buyer_transactions_buyerId_idx" ON "buyer_transactions"("buyerId");

-- CreateIndex
CREATE INDEX "deal_packages_accountId_status_idx" ON "deal_packages"("accountId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "deal_packages_dealId_version_key" ON "deal_packages"("dealId", "version");

-- CreateIndex
CREATE INDEX "disposition_campaigns_accountId_status_idx" ON "disposition_campaigns"("accountId", "status");

-- CreateIndex
CREATE INDEX "disposition_campaigns_dealId_idx" ON "disposition_campaigns"("dealId");

-- CreateIndex
CREATE INDEX "disposition_targets_accountId_status_idx" ON "disposition_targets"("accountId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "disposition_targets_campaignId_buyerId_key" ON "disposition_targets"("campaignId", "buyerId");

-- CreateIndex
CREATE UNIQUE INDEX "deal_share_links_tokenHash_key" ON "deal_share_links"("tokenHash");

-- CreateIndex
CREATE INDEX "deal_share_links_accountId_dealId_idx" ON "deal_share_links"("accountId", "dealId");

-- CreateIndex
CREATE INDEX "deal_share_links_buyerId_idx" ON "deal_share_links"("buyerId");

-- CreateIndex
CREATE INDEX "buyer_offers_accountId_dealId_status_idx" ON "buyer_offers"("accountId", "dealId", "status");

-- CreateIndex
CREATE INDEX "buyer_offers_buyerId_idx" ON "buyer_offers"("buyerId");

-- CreateIndex
CREATE UNIQUE INDEX "assignment_agreements_offerId_key" ON "assignment_agreements"("offerId");

-- CreateIndex
CREATE UNIQUE INDEX "assignment_agreements_contractId_key" ON "assignment_agreements"("contractId");

-- CreateIndex
CREATE INDEX "assignment_agreements_accountId_status_idx" ON "assignment_agreements"("accountId", "status");

-- CreateIndex
CREATE INDEX "assignment_agreements_dealId_idx" ON "assignment_agreements"("dealId");

-- CreateIndex
CREATE UNIQUE INDEX "closing_files_dealId_key" ON "closing_files"("dealId");

-- CreateIndex
CREATE INDEX "closing_files_accountId_status_idx" ON "closing_files"("accountId", "status");

-- CreateIndex
CREATE INDEX "closing_milestones_accountId_status_dueAt_idx" ON "closing_milestones"("accountId", "status", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "closing_milestones_closingFileId_key_key" ON "closing_milestones"("closingFileId", "key");

-- CreateIndex
CREATE INDEX "closing_issues_accountId_dealId_status_idx" ON "closing_issues"("accountId", "dealId", "status");

-- CreateIndex
CREATE INDEX "buyers_accountId_status_idx" ON "buyers"("accountId", "status");

-- AddForeignKey
ALTER TABLE "purchase_agreements" ADD CONSTRAINT "purchase_agreements_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buyer_transactions" ADD CONSTRAINT "buyer_transactions_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "buyers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_packages" ADD CONSTRAINT "deal_packages_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disposition_campaigns" ADD CONSTRAINT "disposition_campaigns_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disposition_campaigns" ADD CONSTRAINT "disposition_campaigns_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "deal_packages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disposition_targets" ADD CONSTRAINT "disposition_targets_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "disposition_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disposition_targets" ADD CONSTRAINT "disposition_targets_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "buyers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_share_links" ADD CONSTRAINT "deal_share_links_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_share_links" ADD CONSTRAINT "deal_share_links_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "deal_packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buyer_offers" ADD CONSTRAINT "buyer_offers_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buyer_offers" ADD CONSTRAINT "buyer_offers_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "buyers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buyer_offers" ADD CONSTRAINT "buyer_offers_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "disposition_campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_agreements" ADD CONSTRAINT "assignment_agreements_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_agreements" ADD CONSTRAINT "assignment_agreements_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "buyer_offers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "closing_files" ADD CONSTRAINT "closing_files_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "closing_milestones" ADD CONSTRAINT "closing_milestones_closingFileId_fkey" FOREIGN KEY ("closingFileId") REFERENCES "closing_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "closing_issues" ADD CONSTRAINT "closing_issues_closingFileId_fkey" FOREIGN KEY ("closingFileId") REFERENCES "closing_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;
