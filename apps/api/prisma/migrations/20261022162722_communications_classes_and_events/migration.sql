-- New tenants start with email and SMS off, and marketing needs its own
-- switch (docs/communications.md s2). Existing tenants keep the channel
-- settings they have; their marketing switches start off.
-- AlterTable
ALTER TABLE "control_plane" ADD COLUMN     "marketingEmailEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "marketingSmsEnabled" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "smsEnabled" SET DEFAULT false,
ALTER COLUMN "emailEnabled" SET DEFAULT false;

-- CreateTable
CREATE TABLE "message_events" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "messageId" TEXT,
    "provider" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "bounceType" TEXT,
    "reason" TEXT,
    "providerEventId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "message_events_accountId_occurredAt_idx" ON "message_events"("accountId", "occurredAt");

-- CreateIndex
CREATE INDEX "message_events_messageId_idx" ON "message_events"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "message_events_provider_providerEventId_key" ON "message_events"("provider", "providerEventId");
