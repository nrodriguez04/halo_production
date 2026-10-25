-- AlterTable
ALTER TABLE "control_plane" ADD COLUMN     "nationwideNote" TEXT,
ADD COLUMN     "nationwideOpenedAt" TIMESTAMP(3),
ADD COLUMN     "nationwideOpenedBy" TEXT,
ADD COLUMN     "nationwideOpenedByName" TEXT;
