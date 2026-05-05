import {
  allowedLeadTransitions,
  isLeadStatus,
  LeadStatus,
  LeadTransitionContext,
  transitionLeadStatus,
} from './lead-status';

const ctx: LeadTransitionContext = {
  accountId: 'acct-1',
  actorId: 'user-1',
  actorType: 'user',
};

describe('LeadStatus state machine', () => {
  describe('allowedLeadTransitions map', () => {
    const all: LeadStatus[] = [
      'new',
      'enriching',
      'enriched',
      'contacted',
      'qualified',
      'disqualified',
    ];

    it('defines transitions for every status', () => {
      for (const status of all) {
        expect(allowedLeadTransitions[status]).toBeDefined();
        expect(Array.isArray(allowedLeadTransitions[status])).toBe(true);
      }
    });

    it('disqualified is terminal', () => {
      expect(allowedLeadTransitions.disqualified).toEqual([]);
    });

    it('every non-terminal status can move to disqualified', () => {
      for (const status of all) {
        if (status === 'disqualified') continue;
        expect(allowedLeadTransitions[status]).toContain('disqualified');
      }
    });
  });

  describe('isLeadStatus', () => {
    it('returns true for known statuses', () => {
      expect(isLeadStatus('new')).toBe(true);
      expect(isLeadStatus('enriching')).toBe(true);
    });
    it('returns false for unknown values', () => {
      expect(isLeadStatus('rejected')).toBe(false);
      expect(isLeadStatus('garbage')).toBe(false);
    });
  });

  describe('transitionLeadStatus', () => {
    it('allows same-status no-op', () => {
      expect(transitionLeadStatus('new', 'new', ctx).allowed).toBe(true);
    });

    it('allows new -> enriching', () => {
      expect(transitionLeadStatus('new', 'enriching', ctx).allowed).toBe(true);
    });

    it('blocks new -> enriched (skipping enriching)', () => {
      const r = transitionLeadStatus('new', 'enriched', ctx);
      expect(r.allowed).toBe(false);
      expect(r.reason).toContain('Invalid transition');
    });

    it('allows enriched -> contacted', () => {
      expect(transitionLeadStatus('enriched', 'contacted', ctx).allowed).toBe(true);
    });

    it('allows enriched -> qualified (fast-track)', () => {
      expect(transitionLeadStatus('enriched', 'qualified', ctx).allowed).toBe(true);
    });

    it('blocks contacted -> new (backward)', () => {
      expect(transitionLeadStatus('contacted', 'new', ctx).allowed).toBe(false);
    });

    it('blocks disqualified -> anything (terminal)', () => {
      expect(transitionLeadStatus('disqualified', 'qualified', ctx).allowed).toBe(false);
      expect(transitionLeadStatus('disqualified', 'new', ctx).allowed).toBe(false);
    });

    it('treats unknown legacy statuses as a free first move', () => {
      // Pre-state-machine leads with status='underwriting' should still
      // be allowed to be transitioned forward once.
      expect(transitionLeadStatus('underwriting', 'enriched', ctx).allowed).toBe(true);
    });
  });
});
