-- CreateTable
CREATE TABLE "marketing_spend" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amountUsd" DOUBLE PRECISION NOT NULL,
    "spentOn" TIMESTAMP(3) NOT NULL,
    "source" TEXT,
    "state" TEXT,
    "vendor" TEXT,
    "note" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketing_spend_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "marketing_spend_accountId_spentOn_idx" ON "marketing_spend"("accountId", "spentOn");
