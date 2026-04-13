import { DealStage } from '../types';

export interface DealTransitionContext {
  tenantId: string;
  actorId: string | null;
  actorType: 'user' | 'system' | 'webhook';
}

export interface DealTransitionResult {
  allowed: boolean;
  reason?: string;
}

export const allowedDealTransitions: Record<DealStage, DealStage[]> = {
  new: ['contacted', 'lost'],
  contacted: ['negotiating', 'lost'],
  negotiating: ['under_contract', 'lost'],
  under_contract: ['marketing', 'lost'],
  marketing: ['assigned', 'lost'],
  assigned: ['closed', 'lost'],
  closed: [],
  lost: [],
};

export function transitionDealStage(
  current: DealStage,
  next: DealStage,
  _ctx: DealTransitionContext,
): DealTransitionResult {
  if (current === next) {
    return { allowed: true };
  }

  const allowedNext = allowedDealTransitions[current] ?? [];
  if (!allowedNext.includes(next)) {
    return {
      allowed: false,
      reason: `Invalid transition: ${current} -> ${next}`,
    };
  }

  return { allowed: true };
}
