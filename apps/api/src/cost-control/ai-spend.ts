import type { PrismaService } from '../prisma.service';

/**
 * Sum of completed OpenAI spend recorded in the ledger since `since`, for one
 * account or, when `accountId` is omitted, across every account (the global
 * daily cap). This replaces the per-service reads of the retired
 * ai_cost_logs table, so every cap check sees the same number the ledger
 * dashboards show.
 */
export async function aiSpendSince(
  prisma: Pick<PrismaService, 'integrationCostEvent'>,
  since: Date,
  accountId?: string,
): Promise<number> {
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

export function startOfToday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}
