-- AlterTable
ALTER TABLE "control_plane" ADD COLUMN     "dncRegistryRequired" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "dnc_registry_lists" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "areaCodes" TEXT[],
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "numberCount" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "fileName" TEXT,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importedBy" TEXT,

    CONSTRAINT "dnc_registry_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dnc_registry_numbers" (
    "listId" TEXT NOT NULL,
    "phone" BIGINT NOT NULL,

    CONSTRAINT "dnc_registry_numbers_pkey" PRIMARY KEY ("listId","phone")
);

-- CreateIndex
CREATE INDEX "dnc_registry_lists_accountId_source_idx" ON "dnc_registry_lists"("accountId", "source");

-- CreateIndex
CREATE INDEX "dnc_registry_numbers_phone_idx" ON "dnc_registry_numbers"("phone");

-- AddForeignKey
ALTER TABLE "dnc_registry_numbers" ADD CONSTRAINT "dnc_registry_numbers_listId_fkey" FOREIGN KEY ("listId") REFERENCES "dnc_registry_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;
