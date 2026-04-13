import {
  transitionDealStage,
  allowedDealTransitions,
  DealTransitionContext,
} from './deal-stage';
import { DealStage } from '../types';

const ctx: DealTransitionContext = {
  tenantId: 'tenant-1',
  actorId: 'user-1',
  actorType: 'user',
};

describe('DealStage State Machine', () => {
  describe('allowedDealTransitions map', () => {
    const allStages: DealStage[] = [
      'new', 'contacted', 'negotiating', 'under_contract',
      'marketing', 'assigned', 'closed', 'lost',
    ];

    it('defines transitions for every stage', () => {
      for (const stage of allStages) {
        expect(allowedDealTransitions[stage]).toBeDefined();
        expect(Array.isArray(allowedDealTransitions[stage])).toBe(true);
      }
    });

    it('terminal stages (closed, lost) have no outgoing transitions', () => {
      expect(allowedDealTransitions.closed).toEqual([]);
      expect(allowedDealTransitions.lost).toEqual([]);
    });

    it('every stage except closed can transition to lost', () => {
      for (const stage of allStages) {
        if (stage === 'closed' || stage === 'lost') continue;
        expect(allowedDealTransitions[stage]).toContain('lost');
      }
    });
  });

  describe('transitionDealStage', () => {
    it('allows same-stage "transition" (no-op)', () => {
      const result = transitionDealStage('new', 'new', ctx);
      expect(result.allowed).toBe(true);
    });

    it('allows new -> contacted', () => {
      const result = transitionDealStage('new', 'contacted', ctx);
      expect(result.allowed).toBe(true);
    });

    it('allows new -> lost', () => {
      const result = transitionDealStage('new', 'lost', ctx);
      expect(result.allowed).toBe(true);
    });

    it('blocks new -> negotiating (skipping contacted)', () => {
      const result = transitionDealStage('new', 'negotiating', ctx);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Invalid transition');
    });

    it('blocks new -> closed (skipping all stages)', () => {
      const result = transitionDealStage('new', 'closed', ctx);
      expect(result.allowed).toBe(false);
    });

    it('blocks lost -> new (terminal)', () => {
      const result = transitionDealStage('lost', 'new', ctx);
      expect(result.allowed).toBe(false);
    });

    it('blocks closed -> new (terminal)', () => {
      const result = transitionDealStage('closed', 'new', ctx);
      expect(result.allowed).toBe(false);
    });

    it('allows the full happy path sequence', () => {
      const happyPath: DealStage[] = [
        'new', 'contacted', 'negotiating', 'under_contract',
        'marketing', 'assigned', 'closed',
      ];
      for (let i = 0; i < happyPath.length - 1; i++) {
        const result = transitionDealStage(happyPath[i], happyPath[i + 1], ctx);
        expect(result.allowed).toBe(true);
      }
    });

    it('blocks backward transitions', () => {
      const result = transitionDealStage('negotiating', 'contacted', ctx);
      expect(result.allowed).toBe(false);
    });

    it('blocks skipping forward more than one step', () => {
      const result = transitionDealStage('contacted', 'under_contract', ctx);
      expect(result.allowed).toBe(false);
    });
  });
});
