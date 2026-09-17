-- Scope ControlPlane to a tenant.
--
-- There was a single unscoped row, so one tenant toggling a switch changed
-- behaviour for every tenant. Each account now owns a row, and the reserved
-- accountId 'GLOBAL' acts as a platform-wide master switch.
--
-- Backfill preserves the existing switch state rather than resetting to
-- defaults: whatever the single row said is copied to every account, so a
-- kill switch that was OFF stays OFF across the upgrade.

ALTER TABLE "control_plane" ADD COLUMN "accountId" TEXT;

-- Copy the pre-existing row (if any) to every account.
INSERT INTO "control_plane" (
  "id", "accountId", "enabled", "smsEnabled", "emailEnabled",
  "docusignEnabled", "externalDataEnabled", "aiEnabled",
  "aiDailyCostCap", "apiDailyCostCap", "updatedAt", "updatedBy"
)
SELECT
  gen_random_uuid()::text, a."id", cp."enabled", cp."smsEnabled", cp."emailEnabled",
  cp."docusignEnabled", cp."externalDataEnabled", cp."aiEnabled",
  cp."aiDailyCostCap", cp."apiDailyCostCap", NOW(), cp."updatedBy"
FROM "accounts" a
CROSS JOIN (
  SELECT * FROM "control_plane" WHERE "accountId" IS NULL LIMIT 1
) cp;

-- Any account with no row yet (no pre-existing control_plane row at all)
-- gets one at the column defaults.
INSERT INTO "control_plane" ("id", "accountId", "updatedAt")
SELECT gen_random_uuid()::text, a."id", NOW()
FROM "accounts" a
WHERE NOT EXISTS (
  SELECT 1 FROM "control_plane" c WHERE c."accountId" = a."id"
);

-- Retire the original unscoped row.
DELETE FROM "control_plane" WHERE "accountId" IS NULL;

ALTER TABLE "control_plane" ALTER COLUMN "accountId" SET NOT NULL;

CREATE UNIQUE INDEX "control_plane_accountId_key" ON "control_plane"("accountId");
