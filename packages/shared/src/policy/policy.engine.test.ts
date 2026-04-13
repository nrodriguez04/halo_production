import { evaluatePolicy, assertPolicy, policySummary } from './policy.engine';
import { PolicyViolationError } from './policy.errors';
import {
  sideEffectsRule,
  consentDncQuietHoursRule,
  aiCostCapRule,
  escalationRule,
  negotiationBoundsRule,
  DEFAULT_POLICY_RULES,
} from './policy.rules';
import { PolicyContext } from './types';

function baseCtx(overrides: Partial<PolicyContext> = {}): PolicyContext {
  return {
    tenantId: 'tenant-1',
    actorId: 'user-1',
    actorType: 'user',
    now: new Date(),
    requestedAction: 'comms.send_sms',
    channel: 'sms',
    sideEffectsEnabled: true,
    messagingEnabled: true,
    hasConsent: true,
    isDnc: false,
    localHour: 14,
    ...overrides,
  };
}

describe('PolicyEngine', () => {
  describe('evaluatePolicy', () => {
    it('returns one decision per rule', () => {
      const decisions = evaluatePolicy(baseCtx());
      expect(decisions).toHaveLength(DEFAULT_POLICY_RULES.length);
    });

    it('all decisions pass for a valid context', () => {
      const decisions = evaluatePolicy(baseCtx());
      expect(decisions.every((d) => d.allow)).toBe(true);
    });

    it('accepts custom rules subset', () => {
      const decisions = evaluatePolicy(baseCtx(), [sideEffectsRule]);
      expect(decisions).toHaveLength(1);
      expect(decisions[0].allow).toBe(true);
    });
  });

  describe('policySummary', () => {
    it('reports allowed when all pass', () => {
      const decisions = evaluatePolicy(baseCtx());
      const summary = policySummary(decisions);
      expect(summary.allowed).toBe(true);
      expect(summary.deniedCodes).toHaveLength(0);
    });

    it('reports denied codes', () => {
      const ctx = baseCtx({ sideEffectsEnabled: false });
      const decisions = evaluatePolicy(ctx);
      const summary = policySummary(decisions);
      expect(summary.allowed).toBe(false);
      expect(summary.deniedCodes).toContain('CONTROL_PLANE_SIDE_EFFECTS_DISABLED');
    });
  });

  describe('assertPolicy', () => {
    it('does not throw when all rules pass', () => {
      expect(() => assertPolicy(baseCtx())).not.toThrow();
    });

    it('throws PolicyViolationError on denial', () => {
      const ctx = baseCtx({ sideEffectsEnabled: false });
      try {
        assertPolicy(ctx);
        fail('should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(PolicyViolationError);
        const err = e as PolicyViolationError;
        expect(err.code).toBe('CONTROL_PLANE_SIDE_EFFECTS_DISABLED');
        expect(err.ctxSummary.tenantId).toBe('tenant-1');
      }
    });

    it('returns decisions array when passing', () => {
      const decisions = assertPolicy(baseCtx());
      expect(Array.isArray(decisions)).toBe(true);
      expect(decisions.length).toBeGreaterThan(0);
    });
  });
});

describe('PolicyRules', () => {
  describe('sideEffectsRule', () => {
    it('denies side-effect actions when control plane disables them', () => {
      const d = sideEffectsRule(baseCtx({ sideEffectsEnabled: false }));
      expect(d.allow).toBe(false);
      expect(d.code).toBe('CONTROL_PLANE_SIDE_EFFECTS_DISABLED');
    });

    it('allows draft actions even when side effects disabled', () => {
      const d = sideEffectsRule(
        baseCtx({
          sideEffectsEnabled: false,
          requestedAction: 'comms.create_draft',
        }),
      );
      expect(d.allow).toBe(true);
    });

    it('denies messaging when messaging disabled', () => {
      const d = sideEffectsRule(baseCtx({ messagingEnabled: false }));
      expect(d.allow).toBe(false);
      expect(d.code).toBe('CONTROL_PLANE_MESSAGING_DISABLED');
    });

    it('allows non-side-effect actions when disabled', () => {
      const d = sideEffectsRule(
        baseCtx({ sideEffectsEnabled: false, requestedAction: 'leads.read' }),
      );
      expect(d.allow).toBe(true);
    });
  });

  describe('consentDncQuietHoursRule', () => {
    it('denies when DNC is true', () => {
      const d = consentDncQuietHoursRule(baseCtx({ isDnc: true }));
      expect(d.allow).toBe(false);
      expect(d.code).toBe('DNC_BLOCKED');
    });

    it('denies when consent is missing', () => {
      const d = consentDncQuietHoursRule(baseCtx({ hasConsent: false }));
      expect(d.allow).toBe(false);
      expect(d.code).toBe('MISSING_CONSENT');
    });

    it('denies during quiet hours (late night)', () => {
      const d = consentDncQuietHoursRule(baseCtx({ localHour: 22 }));
      expect(d.allow).toBe(false);
      expect(d.code).toBe('QUIET_HOURS_BLOCKED');
    });

    it('denies during quiet hours (early morning)', () => {
      const d = consentDncQuietHoursRule(baseCtx({ localHour: 6 }));
      expect(d.allow).toBe(false);
      expect(d.code).toBe('QUIET_HOURS_BLOCKED');
    });

    it('allows during business hours with consent', () => {
      const d = consentDncQuietHoursRule(baseCtx({ localHour: 14 }));
      expect(d.allow).toBe(true);
    });

    it('skips checks for non-messaging channels', () => {
      const d = consentDncQuietHoursRule(
        baseCtx({ channel: 'ai_underwrite', isDnc: true }),
      );
      expect(d.allow).toBe(true);
      expect(d.code).toBe('NOT_MESSAGING_CHANNEL');
    });

    it('allows webhook actor even if DNC/consent checks would fail', () => {
      const d = consentDncQuietHoursRule(
        baseCtx({ actorType: 'webhook', isDnc: true }),
      );
      expect(d.allow).toBe(true);
      expect(d.code).toBe('INBOUND_OR_WEBHOOK_ALLOWED');
    });
  });

  describe('aiCostCapRule', () => {
    it('denies when AI is disabled', () => {
      const d = aiCostCapRule(
        baseCtx({ channel: 'ai_underwrite', aiEnabled: false }),
      );
      expect(d.allow).toBe(false);
      expect(d.code).toBe('AI_DISABLED');
    });

    it('denies when tenant cap reached', () => {
      const d = aiCostCapRule(
        baseCtx({
          channel: 'ai_underwrite',
          dailySpendUsd: 5,
          perTenantCapUsd: 5,
          aiEnabled: true,
        }),
      );
      expect(d.allow).toBe(false);
      expect(d.code).toBe('TENANT_DAILY_CAP_REACHED');
    });

    it('denies when global cap reached', () => {
      const d = aiCostCapRule(
        baseCtx({
          channel: 'ai_underwrite',
          globalDailySpendUsd: 100,
          globalDailyCapUsd: 100,
          aiEnabled: true,
        }),
      );
      expect(d.allow).toBe(false);
      expect(d.code).toBe('GLOBAL_DAILY_CAP_REACHED');
    });

    it('warns at 80% of tenant cap', () => {
      const d = aiCostCapRule(
        baseCtx({
          channel: 'ai_underwrite',
          dailySpendUsd: 4.1,
          perTenantCapUsd: 5,
          aiEnabled: true,
        }),
      );
      expect(d.allow).toBe(true);
      expect(d.code).toBe('AI_SPEND_WARNING_80');
      expect(d.metadata?.warning).toBe(true);
    });

    it('passes for non-AI channels', () => {
      const d = aiCostCapRule(baseCtx({ channel: 'sms' }));
      expect(d.allow).toBe(true);
      expect(d.code).toBe('NOT_AI_ACTION');
    });
  });

  describe('escalationRule', () => {
    it('denies side-effect actions with low confidence', () => {
      const d = escalationRule(baseCtx({ confidenceScore: 0.3 }));
      expect(d.allow).toBe(false);
      expect(d.code).toBe('REQUIRE_ESCALATION_LOW_CONFIDENCE');
    });

    it('denies when legal risk flags present', () => {
      const d = escalationRule(baseCtx({ legalRiskFlags: ['liens'] }));
      expect(d.allow).toBe(false);
      expect(d.code).toBe('REQUIRE_ESCALATION_LEGAL_RISK');
    });

    it('passes with high confidence and no flags', () => {
      const d = escalationRule(baseCtx({ confidenceScore: 0.9 }));
      expect(d.allow).toBe(true);
    });
  });

  describe('negotiationBoundsRule', () => {
    it('denies offer below minimum', () => {
      const d = negotiationBoundsRule(
        baseCtx({ minOffer: 100000, maxOffer: 200000, proposedOffer: 50000 }),
      );
      expect(d.allow).toBe(false);
      expect(d.code).toBe('OFFER_OUT_OF_BOUNDS');
    });

    it('denies offer above maximum', () => {
      const d = negotiationBoundsRule(
        baseCtx({ minOffer: 100000, maxOffer: 200000, proposedOffer: 300000 }),
      );
      expect(d.allow).toBe(false);
      expect(d.code).toBe('OFFER_OUT_OF_BOUNDS');
    });

    it('allows offer within bounds', () => {
      const d = negotiationBoundsRule(
        baseCtx({ minOffer: 100000, maxOffer: 200000, proposedOffer: 150000 }),
      );
      expect(d.allow).toBe(true);
      expect(d.code).toBe('OFFER_WITHIN_BOUNDS');
    });

    it('passes when bounds not configured', () => {
      const d = negotiationBoundsRule(baseCtx());
      expect(d.allow).toBe(true);
      expect(d.code).toBe('NEGOTIATION_BOUNDS_NOT_APPLICABLE');
    });
  });
});
