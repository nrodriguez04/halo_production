-- CreateEnum
CREATE TYPE "JobRunKind" AS ENUM ('UNDERWRITE_DEAL', 'GENERATE_FLYER_DRAFT', 'GENERATE_BUYER_BLAST_DRAFT');

-- CreateEnum
CREATE TYPE "JobRunEntityType" AS ENUM ('DEAL', 'LEAD', 'MESSAGE');

-- CreateEnum
CREATE TYPE "JobRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "TimelineEntityType" AS ENUM ('LEAD', 'DEAL', 'MESSAGE', 'PROPERTY', 'JOB');

-- CreateEnum
CREATE TYPE "TimelineActorType" AS ENUM ('user', 'system', 'webhook');

-- CreateEnum
CREATE TYPE "AutomationRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', 'AWAITING_APPROVAL');

-- CreateEnum
CREATE TYPE "AutomationTriggerType" AS ENUM ('MANUAL', 'SCHEDULED', 'INBOUND_WEBHOOK', 'UI', 'API');

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership_roles" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membership_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_tokens" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "accountId" TEXT,
    "action" TEXT NOT NULL,
    "resource" TEXT,
    "resourceId" TEXT,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'new',
    "score" DOUBLE PRECISION,
    "tags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "canonicalAddress" TEXT,
    "canonicalCity" TEXT,
    "canonicalState" TEXT,
    "canonicalZip" TEXT,
    "canonicalOwner" TEXT,
    "canonicalPhone" TEXT,
    "canonicalEmail" TEXT,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_records" (
    "id" TEXT NOT NULL,
    "leadId" TEXT,
    "propertyId" TEXT,
    "provider" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "trustWeight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "source_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "properties" (
    "id" TEXT NOT NULL,
    "leadId" TEXT,
    "accountId" TEXT NOT NULL,
    "apn" TEXT,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "zip" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "estimatedValue" DOUBLE PRECISION,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "properties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deals" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "leadId" TEXT,
    "propertyId" TEXT,
    "stage" TEXT NOT NULL DEFAULT 'new',
    "arv" DOUBLE PRECISION,
    "repairEstimate" DOUBLE PRECISION,
    "mao" DOUBLE PRECISION,
    "offerAmount" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contracts" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "docusignEnvelopeId" TEXT,
    "status" TEXT NOT NULL,
    "pdfUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "leadId" TEXT,
    "dealId" TEXT,
    "channel" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "sentAt" TIMESTAMP(3),
    "source" TEXT,
    "automationRunId" TEXT,
    "agentName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "buyers" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "preferences" JSONB,
    "engagementScore" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "lastContacted" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "buyers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "control_plane" (
    "id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "smsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "docusignEnabled" BOOLEAN NOT NULL DEFAULT true,
    "externalDataEnabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "control_plane_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_cost_logs" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "tokensIn" INTEGER,
    "tokensOut" INTEGER,
    "cost" DOUBLE PRECISION NOT NULL,
    "accountId" TEXT,
    "automationRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_cost_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dnc_list" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "dnc_list_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consents" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "leadId" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "channel" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "evidence" JSONB,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiet_hours" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/Los_Angeles',
    "startHour" INTEGER NOT NULL DEFAULT 20,
    "endHour" INTEGER NOT NULL DEFAULT 9,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quiet_hours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pii_envelopes" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "leadId" TEXT,
    "propertyId" TEXT,
    "fieldName" TEXT NOT NULL,
    "encryptedValue" TEXT NOT NULL,
    "keyVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pii_envelopes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_queues" (
    "id" TEXT NOT NULL,
    "queueName" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "data" JSONB,
    "result" JSONB,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "job_queues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "underwriting_results" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "propertyId" TEXT,
    "arv" DOUBLE PRECISION,
    "repairEstimate" DOUBLE PRECISION,
    "mao" DOUBLE PRECISION,
    "confidence" DOUBLE PRECISION,
    "rationale" TEXT,
    "compsSummary" JSONB,
    "evaluationMetadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "underwriting_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketing_materials" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "content" TEXT,
    "fileUrl" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketing_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_runs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" "JobRunKind" NOT NULL,
    "entityType" "JobRunEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "status" "JobRunStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "resultJson" JSONB,
    "resultHash" TEXT,
    "actorId" TEXT,
    "automationRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timeline_events" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entityType" "TimelineEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payloadJson" JSONB,
    "actorId" TEXT,
    "actorType" "TimelineActorType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "timeline_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_runs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'openclaw',
    "agentName" TEXT,
    "workflowName" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "status" "AutomationRunStatus" NOT NULL DEFAULT 'QUEUED',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "triggerType" "AutomationTriggerType" NOT NULL DEFAULT 'API',
    "inputJson" JSONB,
    "outputJson" JSONB,
    "decisionJson" JSONB,
    "errorJson" JSONB,
    "approvalRequired" BOOLEAN NOT NULL DEFAULT false,
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "modelProvider" TEXT,
    "modelName" TEXT,
    "promptVersion" TEXT,
    "estimatedValueUsd" DOUBLE PRECISION,
    "realizedValueUsd" DOUBLE PRECISION,
    "aiCostUsd" DOUBLE PRECISION DEFAULT 0,
    "messageCostUsd" DOUBLE PRECISION DEFAULT 0,
    "toolCostUsd" DOUBLE PRECISION DEFAULT 0,
    "otherCostUsd" DOUBLE PRECISION DEFAULT 0,
    "humanReviewMinutes" DOUBLE PRECISION,
    "parentRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deal_economics" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contractPrice" DOUBLE PRECISION,
    "assignmentPrice" DOUBLE PRECISION,
    "assignmentFee" DOUBLE PRECISION,
    "purchasePrice" DOUBLE PRECISION,
    "salePrice" DOUBLE PRECISION,
    "closingCosts" DOUBLE PRECISION,
    "marketingCost" DOUBLE PRECISION,
    "skipTraceCost" DOUBLE PRECISION,
    "smsCost" DOUBLE PRECISION,
    "emailCost" DOUBLE PRECISION,
    "aiCostAllocated" DOUBLE PRECISION,
    "toolingCost" DOUBLE PRECISION,
    "laborCost" DOUBLE PRECISION,
    "otherCost" DOUBLE PRECISION,
    "grossRevenue" DOUBLE PRECISION,
    "netProfit" DOUBLE PRECISION,
    "roiPercent" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deal_economics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_accountId_userId_key" ON "memberships"("accountId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_name_key" ON "permissions"("name");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_roleId_permissionId_key" ON "role_permissions"("roleId", "permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "membership_roles_membershipId_roleId_key" ON "membership_roles"("membershipId", "roleId");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_sessionToken_key" ON "sessions"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_token_key" ON "verification_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_identifier_token_key" ON "verification_tokens"("identifier", "token");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_accountId_idx" ON "audit_logs"("accountId");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "leads_accountId_idx" ON "leads"("accountId");

-- CreateIndex
CREATE INDEX "leads_status_idx" ON "leads"("status");

-- CreateIndex
CREATE INDEX "source_records_leadId_idx" ON "source_records"("leadId");

-- CreateIndex
CREATE INDEX "source_records_propertyId_idx" ON "source_records"("propertyId");

-- CreateIndex
CREATE INDEX "source_records_provider_idx" ON "source_records"("provider");

-- CreateIndex
CREATE INDEX "properties_accountId_idx" ON "properties"("accountId");

-- CreateIndex
CREATE INDEX "properties_apn_idx" ON "properties"("apn");

-- CreateIndex
CREATE INDEX "properties_address_city_state_zip_idx" ON "properties"("address", "city", "state", "zip");

-- CreateIndex
CREATE INDEX "deals_accountId_idx" ON "deals"("accountId");

-- CreateIndex
CREATE INDEX "deals_stage_idx" ON "deals"("stage");

-- CreateIndex
CREATE UNIQUE INDEX "contracts_docusignEnvelopeId_key" ON "contracts"("docusignEnvelopeId");

-- CreateIndex
CREATE INDEX "contracts_dealId_idx" ON "contracts"("dealId");

-- CreateIndex
CREATE INDEX "contracts_docusignEnvelopeId_idx" ON "contracts"("docusignEnvelopeId");

-- CreateIndex
CREATE INDEX "messages_accountId_idx" ON "messages"("accountId");

-- CreateIndex
CREATE INDEX "messages_leadId_idx" ON "messages"("leadId");

-- CreateIndex
CREATE INDEX "messages_status_idx" ON "messages"("status");

-- CreateIndex
CREATE INDEX "messages_automationRunId_idx" ON "messages"("automationRunId");

-- CreateIndex
CREATE INDEX "buyers_accountId_idx" ON "buyers"("accountId");

-- CreateIndex
CREATE INDEX "ai_cost_logs_provider_idx" ON "ai_cost_logs"("provider");

-- CreateIndex
CREATE INDEX "ai_cost_logs_accountId_idx" ON "ai_cost_logs"("accountId");

-- CreateIndex
CREATE INDEX "ai_cost_logs_createdAt_idx" ON "ai_cost_logs"("createdAt");

-- CreateIndex
CREATE INDEX "ai_cost_logs_automationRunId_idx" ON "ai_cost_logs"("automationRunId");

-- CreateIndex
CREATE INDEX "dnc_list_phone_idx" ON "dnc_list"("phone");

-- CreateIndex
CREATE INDEX "dnc_list_accountId_idx" ON "dnc_list"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "dnc_list_accountId_phone_key" ON "dnc_list"("accountId", "phone");

-- CreateIndex
CREATE INDEX "consents_accountId_idx" ON "consents"("accountId");

-- CreateIndex
CREATE INDEX "consents_leadId_idx" ON "consents"("leadId");

-- CreateIndex
CREATE INDEX "consents_phone_idx" ON "consents"("phone");

-- CreateIndex
CREATE INDEX "consents_email_idx" ON "consents"("email");

-- CreateIndex
CREATE UNIQUE INDEX "quiet_hours_accountId_key" ON "quiet_hours"("accountId");

-- CreateIndex
CREATE INDEX "pii_envelopes_accountId_idx" ON "pii_envelopes"("accountId");

-- CreateIndex
CREATE INDEX "pii_envelopes_leadId_idx" ON "pii_envelopes"("leadId");

-- CreateIndex
CREATE INDEX "pii_envelopes_propertyId_idx" ON "pii_envelopes"("propertyId");

-- CreateIndex
CREATE INDEX "job_queues_queueName_idx" ON "job_queues"("queueName");

-- CreateIndex
CREATE INDEX "job_queues_status_idx" ON "job_queues"("status");

-- CreateIndex
CREATE INDEX "job_queues_jobId_idx" ON "job_queues"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "underwriting_results_dealId_key" ON "underwriting_results"("dealId");

-- CreateIndex
CREATE INDEX "underwriting_results_propertyId_idx" ON "underwriting_results"("propertyId");

-- CreateIndex
CREATE INDEX "marketing_materials_dealId_idx" ON "marketing_materials"("dealId");

-- CreateIndex
CREATE INDEX "marketing_materials_type_idx" ON "marketing_materials"("type");

-- CreateIndex
CREATE INDEX "job_runs_tenantId_kind_entityId_idx" ON "job_runs"("tenantId", "kind", "entityId");

-- CreateIndex
CREATE INDEX "job_runs_tenantId_status_idx" ON "job_runs"("tenantId", "status");

-- CreateIndex
CREATE INDEX "job_runs_automationRunId_idx" ON "job_runs"("automationRunId");

-- CreateIndex
CREATE INDEX "timeline_events_tenantId_entityType_entityId_createdAt_idx" ON "timeline_events"("tenantId", "entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "timeline_events_tenantId_eventType_createdAt_idx" ON "timeline_events"("tenantId", "eventType", "createdAt");

-- CreateIndex
CREATE INDEX "automation_runs_tenantId_status_idx" ON "automation_runs"("tenantId", "status");

-- CreateIndex
CREATE INDEX "automation_runs_tenantId_entityType_entityId_idx" ON "automation_runs"("tenantId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "automation_runs_tenantId_source_createdAt_idx" ON "automation_runs"("tenantId", "source", "createdAt");

-- CreateIndex
CREATE INDEX "automation_runs_tenantId_workflowName_createdAt_idx" ON "automation_runs"("tenantId", "workflowName", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "deal_economics_dealId_key" ON "deal_economics"("dealId");

-- CreateIndex
CREATE INDEX "deal_economics_tenantId_idx" ON "deal_economics"("tenantId");

-- CreateIndex
CREATE INDEX "deal_economics_dealId_idx" ON "deal_economics"("dealId");

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_roles" ADD CONSTRAINT "membership_roles_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_roles" ADD CONSTRAINT "membership_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_records" ADD CONSTRAINT "source_records_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_records" ADD CONSTRAINT "source_records_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_automationRunId_fkey" FOREIGN KEY ("automationRunId") REFERENCES "automation_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "underwriting_results" ADD CONSTRAINT "underwriting_results_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "underwriting_results" ADD CONSTRAINT "underwriting_results_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_materials" ADD CONSTRAINT "marketing_materials_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_parentRunId_fkey" FOREIGN KEY ("parentRunId") REFERENCES "automation_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_economics" ADD CONSTRAINT "deal_economics_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
