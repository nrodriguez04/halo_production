-- AlterTable
ALTER TABLE "control_plane" ADD COLUMN     "agentAutonomy" TEXT NOT NULL DEFAULT 'draft_only',
ADD COLUMN     "agentModels" JSONB;
