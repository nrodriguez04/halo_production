/**
 * Budget bucket period math, shared by the api's BudgetService and the
 * worker's cost ledger so both sides roll a bucket into a new period the
 * same way. A bucket whose `periodResetsAt` has passed is expired: its
 * `currentSpendUsd` belongs to the old period and must not constrain the
 * new one.
 */
export function nextPeriod(period: string, anchor: Date): { startedAt: Date; resetsAt: Date } {
  const startedAt = startOfPeriod(period, anchor);
  const resetsAt = endOfPeriod(period, startedAt);
  return { startedAt, resetsAt };
}

export function startOfPeriod(period: string, d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  if (period === 'week') {
    const day = out.getDay();
    out.setDate(out.getDate() - day);
  } else if (period === 'month') {
    out.setDate(1);
  }
  return out;
}

export function endOfPeriod(period: string, start: Date): Date {
  const out = new Date(start);
  if (period === 'day') out.setDate(out.getDate() + 1);
  else if (period === 'week') out.setDate(out.getDate() + 7);
  else if (period === 'month') out.setMonth(out.getMonth() + 1);
  else out.setDate(out.getDate() + 1);
  return out;
}

export function isBucketExpired(bucket: { periodResetsAt: Date }, now: Date = new Date()): boolean {
  return bucket.periodResetsAt.getTime() <= now.getTime();
}
