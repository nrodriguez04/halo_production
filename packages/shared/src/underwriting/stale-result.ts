export type UnderwritingStaleReason = 'deal_modified_after_enqueue';

export function shouldApplyUnderwritingResult(params: {
  runCreatedAt: Date;
  dealUpdatedAt: Date;
}): { applied: true } | { applied: false; reason: UnderwritingStaleReason } {
  if (params.dealUpdatedAt.getTime() > params.runCreatedAt.getTime()) {
    return {
      applied: false,
      reason: 'deal_modified_after_enqueue',
    };
  }

  return { applied: true };
}

export function markUnderwritingResultUnapplied<T extends Record<string, unknown>>(
  result: T,
  reason: UnderwritingStaleReason,
): T & { applied: false; staleReason: UnderwritingStaleReason } {
  return {
    ...result,
    applied: false,
    staleReason: reason,
  };
}

export function isAppliedUnderwritingResult(result: unknown): boolean {
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    return true;
  }

  return (result as { applied?: boolean }).applied !== false;
}
