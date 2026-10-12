import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { agentJobId, type AgentJobPayload } from '@halo/shared';

let queue: Queue | null = null;

function agentsQueue(): Queue {
  if (!queue) {
    const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
    });
    queue = new Queue('agents', { connection: redis });
  }
  return queue;
}

/**
 * Queues an agent run from a processor (the worker is where a lead becomes
 * `enriched`). The job id carries the trigger event, so a replayed job never
 * queues the agent twice. A queue failure is logged, never thrown: the
 * enrichment that just finished must not be rolled back by it.
 */
export async function enqueueAgentJob(payload: AgentJobPayload): Promise<void> {
  try {
    await agentsQueue().add(payload.agent, payload, {
      jobId: agentJobId(payload),
      removeOnComplete: 500,
      removeOnFail: 200,
    });
  } catch (err) {
    console.error(
      `[agents-queue] could not queue ${payload.agent} for ${payload.entityType} ${payload.entityId}: ${(err as Error).message}`,
    );
  }
}
