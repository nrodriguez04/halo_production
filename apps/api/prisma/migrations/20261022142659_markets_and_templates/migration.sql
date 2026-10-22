-- Markets replace jurisdiction_policies (docs/markets.md). Any existing
-- policy is carried into a market draft. A policy reviewed under the old
-- process goes into review: the new process needs counsel's memo to approve.

-- CreateTable
CREATE TABLE "markets" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "classification" TEXT NOT NULL DEFAULT 'unclassified',
    "draft" JSONB NOT NULL,
    "draftStatus" TEXT NOT NULL DEFAULT 'draft',
    "draftUpdatedAt" TIMESTAMP(3),
    "draftUpdatedBy" TEXT,
    "submittedAt" TIMESTAMP(3),
    "submittedBy" TEXT,
    "researchImportedAt" TIMESTAMP(3),
    "researchDate" TEXT,
    "researchConfidence" TEXT,
    "approvedVersionId" TEXT,
    "requestedStatus" TEXT NOT NULL DEFAULT 'RESEARCH_ONLY',
    "statusNote" TEXT,
    "statusSetBy" TEXT,
    "statusSetAt" TIMESTAMP(3),
    "operatorUserId" TEXT,
    "operatorName" TEXT,
    "selfTestAt" TIMESTAMP(3),
    "selfTestPassed" BOOLEAN,
    "selfTestResult" JSONB,
    "configChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "markets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_policy_versions" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "classification" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "approvedBy" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "counselName" TEXT NOT NULL,
    "counselFirm" TEXT,
    "memoDocumentId" TEXT NOT NULL,
    "attestation" TEXT NOT NULL,
    "reviewExpiresAt" TIMESTAMP(3),
    "supersededAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "market_policy_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_authorizations" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "holderName" TEXT NOT NULL,
    "holderType" TEXT NOT NULL DEFAULT 'company',
    "holderUserId" TEXT,
    "identifier" TEXT,
    "issuedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "documentId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "verifiedAt" TIMESTAMP(3),
    "verifiedBy" TEXT,
    "notes" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "market_authorizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_templates" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "disclosureKey" TEXT,
    "createdBy" TEXT,
    "retiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_template_versions" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "documentId" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "fields" TEXT[],
    "unknownFields" TEXT[],
    "missingRequired" TEXT[],
    "states" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'draft',
    "counselName" TEXT,
    "counselFirm" TEXT,
    "approvalDocumentId" TEXT,
    "attestation" TEXT,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "retiredAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_template_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_generations" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "dealId" TEXT,
    "templateVersionId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "state" TEXT,
    "values" JSONB NOT NULL,
    "documentId" TEXT NOT NULL,
    "pdfDocumentId" TEXT,
    "sha256" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "envelopeId" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_generations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "markets_accountId_state_key" ON "markets"("accountId", "state");

-- CreateIndex
CREATE INDEX "market_policy_versions_accountId_state_idx" ON "market_policy_versions"("accountId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "market_policy_versions_accountId_state_version_key" ON "market_policy_versions"("accountId", "state", "version");

-- CreateIndex
CREATE INDEX "market_authorizations_accountId_state_idx" ON "market_authorizations"("accountId", "state");

-- CreateIndex
CREATE INDEX "document_templates_accountId_kind_idx" ON "document_templates"("accountId", "kind");

-- CreateIndex
CREATE INDEX "document_template_versions_accountId_status_idx" ON "document_template_versions"("accountId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "document_template_versions_templateId_version_key" ON "document_template_versions"("templateId", "version");

-- CreateIndex
CREATE INDEX "document_generations_accountId_dealId_idx" ON "document_generations"("accountId", "dealId");

-- AddForeignKey
ALTER TABLE "document_template_versions" ADD CONSTRAINT "document_template_versions_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "document_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Carry existing state policies into market drafts.
INSERT INTO "markets" ("id", "accountId", "state", "draft", "draftStatus", "draftUpdatedAt", "draftUpdatedBy", "submittedAt", "statusNote", "createdAt", "updatedAt")
SELECT
    p."id",
    p."accountId",
    p."state",
    jsonb_build_object(
        'summary', 'Carried over from the earlier state policy. ' || COALESCE(p."references", '') || CASE WHEN p."notes" IS NULL THEN '' ELSE ' Notes: ' || p."notes" END,
        'answers', jsonb_build_object(
            'license_required_for_activity', jsonb_build_object(
                'answer', CASE p."licenseRequired" WHEN 'yes' THEN 'yes' WHEN 'no' THEN 'no' ELSE 'unknown' END,
                'note', '',
                'sourceIds', '[]'::jsonb
            )
        ),
        'structures', jsonb_build_object(
            'assignment', jsonb_build_object('permission', CASE p."assignmentAllowed" WHEN 'allowed' THEN 'allowed' WHEN 'conditional' THEN 'conditional' WHEN 'prohibited' THEN 'prohibited' ELSE 'unknown' END, 'conditions', p."conditions"),
            'double_close', jsonb_build_object('permission', CASE p."doubleCloseAllowed" WHEN 'allowed' THEN 'allowed' WHEN 'conditional' THEN 'conditional' WHEN 'prohibited' THEN 'prohibited' ELSE 'unknown' END, 'conditions', NULL)
        ),
        'channels', jsonb_build_object(
            'public_listing', jsonb_build_object('permission', CASE p."publicMarketingAllowed" WHEN 'allowed' THEN 'allowed' WHEN 'conditional' THEN 'conditional' WHEN 'prohibited' THEN 'prohibited' ELSE 'unknown' END, 'conditions', NULL)
        ),
        'disclosures',
            COALESCE((SELECT jsonb_agg(jsonb_build_object('key', k, 'title', k, 'audience', 'buyer', 'timing', 'before_marketing', 'templateKind', NULL, 'sourceIds', '[]'::jsonb)) FROM unnest(p."buyerDisclosureKeys") AS k), '[]'::jsonb)
            || COALESCE((SELECT jsonb_agg(jsonb_build_object('key', k, 'title', k, 'audience', 'seller', 'timing', 'before_seller_signs', 'templateKind', NULL, 'sourceIds', '[]'::jsonb)) FROM unnest(p."sellerDisclosureKeys") AS k WHERE NOT (k = ANY(p."buyerDisclosureKeys"))), '[]'::jsonb)
    ),
    CASE WHEN p."status" = 'reviewed' THEN 'in_review' ELSE 'draft' END,
    p."updatedAt",
    p."updatedBy",
    CASE WHEN p."status" = 'reviewed' THEN p."reviewedAt" ELSE NULL END,
    CASE WHEN p."status" = 'reviewed' THEN 'Reviewed under the earlier process. Approve it again with counsel''s memo.' ELSE NULL END,
    p."createdAt",
    CURRENT_TIMESTAMP
FROM "jurisdiction_policies" p
WHERE p."status" <> 'retired';

-- DropTable
DROP TABLE "jurisdiction_policies";
