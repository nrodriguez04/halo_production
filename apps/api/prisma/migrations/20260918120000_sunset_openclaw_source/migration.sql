-- OpenClaw is retired as the agent runtime. Rows it created carry
-- source = 'openclaw'; the application now stamps and filters on 'agent',
-- so rename the historical values and move the column default.
UPDATE "automation_runs" SET "source" = 'agent' WHERE "source" = 'openclaw';
UPDATE "messages" SET "source" = 'agent' WHERE "source" = 'openclaw';
ALTER TABLE "automation_runs" ALTER COLUMN "source" SET DEFAULT 'agent';
