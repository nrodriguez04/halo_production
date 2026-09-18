-- Register SendGrid as a cost-governed email provider on databases whose
-- reference data was already seeded. A fresh database is left alone: the
-- startup bootstrap seeds every provider (SendGrid included) only when the
-- table is empty, and inserting one row here would suppress that.
INSERT INTO "integration_providers"
  ("id", "key", "displayName", "category", "enabled", "defaultCostUsd", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, 'sendgrid', 'SendGrid', 'comms', true, 0, now(), now()
WHERE EXISTS (SELECT 1 FROM "integration_providers")
  AND NOT EXISTS (SELECT 1 FROM "integration_providers" WHERE "key" = 'sendgrid');

INSERT INTO "provider_pricing_rules"
  ("id", "providerId", "action", "unitCostUsd", "unit", "pricePer", "effectiveAt")
SELECT gen_random_uuid()::text, p."id", 'send_email', 0.0004, 'per_call', 1, now()
FROM "integration_providers" p
WHERE p."key" = 'sendgrid'
  AND NOT EXISTS (
    SELECT 1 FROM "provider_pricing_rules" r
    WHERE r."providerId" = p."id" AND r."action" = 'send_email'
  );
