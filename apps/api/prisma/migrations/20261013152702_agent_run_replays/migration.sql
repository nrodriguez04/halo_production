-- Agent run replays: what an agent saw and what the model answered, per run
-- (agent-orchestration.service.ts recordDecision; docs/agent-eval.md).
-- CreateTable
CREATE TABLE "agent_run_replays" (
    "runId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "agent" TEXT NOT NULL,
    "promptVersion" TEXT,
    "context" JSONB NOT NULL,
    "reply" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_run_replays_pkey" PRIMARY KEY ("runId")
);

-- CreateIndex
CREATE INDEX "agent_run_replays_tenantId_agent_createdAt_idx" ON "agent_run_replays"("tenantId", "agent", "createdAt");

-- AddForeignKey
ALTER TABLE "agent_run_replays" ADD CONSTRAINT "agent_run_replays_runId_fkey" FOREIGN KEY ("runId") REFERENCES "automation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
