export interface BudgetBucketPeriodLike {
  period: string;
  periodResetsAt: Date;
}

export interface BudgetBucketResetData {
  periodStartedAt: Date;
  periodResetsAt: Date;
  currentSpendUsd: number;
}

export function nextBudgetPeriod(
  period: string,
  anchor: Date,
): { startedAt: Date; resetsAt: Date } {
  const startedAt = startOfBudgetPeriod(period, anchor);
  const resetsAt = endOfBudgetPeriod(period, startedAt);
  return { startedAt, resetsAt };
}

export function getExpiredBudgetBucketReset(
  bucket: BudgetBucketPeriodLike,
  now: Date = new Date(),
): BudgetBucketResetData | null {
  if (bucket.periodResetsAt.getTime() > now.getTime()) {
    return null;
  }

  const { startedAt, resetsAt } = nextBudgetPeriod(bucket.period, now);
  return {
    periodStartedAt: startedAt,
    periodResetsAt: resetsAt,
    currentSpendUsd: 0,
  };
}

export function wouldExceedHardCap(
  currentSpendUsd: number,
  hardCapUsd: number,
  estimatedCostUsd: number = 0,
): boolean {
  return currentSpendUsd + estimatedCostUsd > hardCapUsd;
}

function startOfBudgetPeriod(period: string, anchor: Date): Date {
  const out = new Date(anchor);
  out.setHours(0, 0, 0, 0);

  if (period === 'week') {
    out.setDate(out.getDate() - out.getDay());
  } else if (period === 'month') {
    out.setDate(1);
  }

  return out;
}

function endOfBudgetPeriod(period: string, start: Date): Date {
  const out = new Date(start);

  if (period === 'day') {
    out.setDate(out.getDate() + 1);
  } else if (period === 'week') {
    out.setDate(out.getDate() + 7);
  } else if (period === 'month') {
    out.setMonth(out.getMonth() + 1);
  } else {
    out.setDate(out.getDate() + 1);
  }

  return out;
}
