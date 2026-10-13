-- Tenant wholesale fee: buyers pay the seller price plus this (packages/shared/src/utils/buyer-price.ts),
-- and the Deal Underwriter subtracts it in the MAO.
ALTER TABLE "control_plane" ADD COLUMN "defaultAssignmentFee" INTEGER NOT NULL DEFAULT 10000;
