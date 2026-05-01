/*
  Warnings:

  - You are about to drop the column `ipAddress` on the `audit_logs` table. All the data in the column will be lost.
  - You are about to drop the column `metadata` on the `audit_logs` table. All the data in the column will be lost.
  - You are about to drop the column `resourceId` on the `audit_logs` table. All the data in the column will be lost.
  - You are about to drop the column `userAgent` on the `audit_logs` table. All the data in the column will be lost.
  - Made the column `accountId` on table `audit_logs` required. This step will fail if there are existing NULL values in that column.
  - Made the column `resource` on table `audit_logs` required. This step will fail if there are existing NULL values in that column.

*/
-- DropIndex
DROP INDEX "audit_logs_accountId_idx";

-- DropIndex
DROP INDEX "audit_logs_action_idx";

-- DropIndex
DROP INDEX "audit_logs_createdAt_idx";

-- DropIndex
DROP INDEX "audit_logs_userId_idx";

-- AlterTable
ALTER TABLE "audit_logs" DROP COLUMN "ipAddress",
DROP COLUMN "metadata",
DROP COLUMN "resourceId",
DROP COLUMN "userAgent",
ADD COLUMN     "details" JSONB,
ADD COLUMN     "ip" TEXT,
ALTER COLUMN "accountId" SET NOT NULL,
ALTER COLUMN "resource" SET NOT NULL;

-- AlterTable
ALTER TABLE "control_plane" ADD COLUMN     "apiDailyCostCap" DOUBLE PRECISION NOT NULL DEFAULT 50;

-- CreateTable
CREATE TABLE "api_cost_logs" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "costUsd" DOUBLE PRECISION NOT NULL,
    "responseCode" INTEGER,
    "durationMs" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_cost_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "api_cost_logs_accountId_provider_createdAt_idx" ON "api_cost_logs"("accountId", "provider", "createdAt");

-- CreateIndex
CREATE INDEX "api_cost_logs_createdAt_idx" ON "api_cost_logs"("createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_accountId_createdAt_idx" ON "audit_logs"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_action_createdAt_idx" ON "audit_logs"("action", "createdAt");
