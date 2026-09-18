-- Fold the two legacy cost tables into integration_cost_events, the ledger
-- that IntegrationCostControlService already writes for every governed call.
--
-- ai_cost_logs  : written directly by worker processors alongside the ledger
--                 row the api recorded for the same completion (double count).
-- api_cost_logs : read-only since the cost-control cutover; only the demo seed
--                 still wrote to it.
--
-- Historical rows are copied so dashboards keep their history, tagged in
-- metadata.legacy and decision LEGACY_* so they can be told apart. Rows that
-- reference a provider key with no integration_providers row get a disabled
-- stub provider; the startup bootstrap upserts the real definition over it.

-- 1. Stub providers for any legacy key that is not registered yet.
INSERT INTO "integration_providers"
  ("id", "key", "displayName", "category", "enabled", "defaultCostUsd", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, k.key, k.key, 'legacy', false, 0, now(), now()
FROM (
  SELECT DISTINCT "provider" AS key FROM "ai_cost_logs"
  UNION
  SELECT DISTINCT "provider" AS key FROM "api_cost_logs"
) k
WHERE NOT EXISTS (SELECT 1 FROM "integration_providers" p WHERE p."key" = k.key);

-- 2. ai_cost_logs -> ledger
INSERT INTO "integration_cost_events"
  ("id", "accountId", "providerId", "providerKey", "action", "reservationId",
   "estimatedCostUsd", "actualCostUsd", "status", "decision", "retryCount",
   "automationRunId", "actor", "metadata", "bucketIds", "createdAt", "completedAt")
SELECT
  'legacy-ai-' || l."id",
  COALESCE(l."accountId", 'GLOBAL'),
  p."id",
  l."provider",
  'chat_completion',
  'legacy-ai-' || l."id",
  l."cost",
  l."cost",
  'completed',
  'LEGACY_AI_LOG',
  0,
  l."automationRunId",
  'system',
  jsonb_build_object(
    'legacy', 'ai_cost_logs',
    'model', l."model",
    'tokensIn', l."tokensIn",
    'tokensOut', l."tokensOut",
    'unattributed', (l."accountId" IS NULL)
  ),
  '{}',
  l."createdAt",
  l."createdAt"
FROM "ai_cost_logs" l
JOIN "integration_providers" p ON p."key" = l."provider";

-- 3. api_cost_logs -> ledger
INSERT INTO "integration_cost_events"
  ("id", "accountId", "providerId", "providerKey", "action", "reservationId",
   "estimatedCostUsd", "actualCostUsd", "status", "decision", "durationMs",
   "responseCode", "retryCount", "actor", "metadata", "bucketIds", "createdAt", "completedAt")
SELECT
  'legacy-api-' || l."id",
  l."accountId",
  p."id",
  l."provider",
  l."endpoint",
  'legacy-api-' || l."id",
  l."costUsd",
  l."costUsd",
  'completed',
  'LEGACY_API_LOG',
  l."durationMs",
  l."responseCode",
  0,
  'system',
  COALESCE(l."metadata", '{}'::jsonb) || jsonb_build_object('legacy', 'api_cost_logs'),
  '{}',
  l."createdAt",
  l."createdAt"
FROM "api_cost_logs" l
JOIN "integration_providers" p ON p."key" = l."provider";

-- 4. Retire the legacy tables.
DROP TABLE "ai_cost_logs";
DROP TABLE "api_cost_logs";
