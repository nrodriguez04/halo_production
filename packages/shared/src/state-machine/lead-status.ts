// Lead status state machine. The canonical owner of these transitions
// is `LeadLifecycleService` in `apps/api`; the worker imports the
// validator below so processors don't have to talk back to the api just
// to record a status change.
//
// Today only `new` -> `enriching` -> `enriched` is exercised by the
// codebase, but the full set is declared so we don't have to add new
// migrations every time we wire a downstream stage (qualified, etc.).

export type LeadStatus =
  | 'new'
  | 'enriching'
  | 'enriched'
  | 'contacted'
  | 'qualified'
  | 'disqualified';

export interface LeadTransitionContext {
  accountId: string;
  actorId: string | null;
  actorType: 'user' | 'system' | 'worker' | 'webhook';
  reason?: string;
}

export interface LeadTransitionResult {
  allowed: boolean;
  reason?: string;
}

export const allowedLeadTransitions: Record<LeadStatus, LeadStatus[]> = {
  new: ['enriching', 'disqualified'],
  enriching: ['enriched', 'disqualified'],
  enriched: ['contacted', 'qualified', 'disqualified'],
  contacted: ['qualified', 'disqualified'],
  qualified: ['disqualified'],
  disqualified: [],
};

const ALL_STATUSES: ReadonlySet<LeadStatus> = new Set([
  'new',
  'enriching',
  'enriched',
  'contacted',
  'qualified',
  'disqualified',
]);

export function isLeadStatus(value: string): value is LeadStatus {
  return ALL_STATUSES.has(value as LeadStatus);
}

export function transitionLeadStatus(
  current: LeadStatus | string,
  next: LeadStatus,
  _ctx: LeadTransitionContext,
): LeadTransitionResult {
  if (current === next) return { allowed: true };

  // Unknown legacy values (e.g. leads imported before the state machine
  // existed) are allowed to transition once into a known status. After
  // that the table governs all moves.
  if (!isLeadStatus(current)) return { allowed: true };

  const allowedNext = allowedLeadTransitions[current] ?? [];
  if (!allowedNext.includes(next)) {
    return {
      allowed: false,
      reason: `Invalid transition: ${current} -> ${next}`,
    };
  }
  return { allowed: true };
}
