-- Auto-enrichment of new leads (sourcing/auto-enrich.service.ts)
ALTER TABLE "control_plane" ADD COLUMN "autoEnrichEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "control_plane" ADD COLUMN "autoEnrichDailyCap" INTEGER NOT NULL DEFAULT 20;
