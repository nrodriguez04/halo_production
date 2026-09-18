import { prisma } from './prisma-client';

/**
 * Completed OpenAI spend recorded in the ledger since `since`, for one
 * account or across all accounts when omitted. Worker AI calls go through
 * the api's /internal/ai/chat-completion, which writes the ledger row, so
 * this is the same number the api's cap checks and dashboards use.
 */
export async function aiSpendSince(since: Date, accountId?: string): Promise<number> {
  const agg = await prisma.integrationCostEvent.aggregate({
    where: {
      providerKey: 'openai',
      status: 'completed',
      createdAt: { gte: since },
      ...(accountId ? { accountId } : {}),
    },
    _sum: { actualCostUsd: true },
  });
  return agg._sum.actualCostUsd ?? 0;
}
