-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "storageKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "dealId" TEXT,
    "leadId" TEXT,
    "buyerId" TEXT,
    "jurisdiction" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "tags" TEXT[],
    "uploadedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "documents_accountId_category_createdAt_idx" ON "documents"("accountId", "category", "createdAt");

-- CreateIndex
CREATE INDEX "documents_accountId_dealId_idx" ON "documents"("accountId", "dealId");

-- CreateIndex
CREATE INDEX "documents_accountId_status_idx" ON "documents"("accountId", "status");
