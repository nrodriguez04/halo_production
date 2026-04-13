import { PolicyViolationError } from './policy.errors';
import { DEFAULT_POLICY_RULES } from './policy.rules';
import { PolicyCheck, PolicyContext, PolicyDecision } from './types';

export function evaluatePolicy(
  ctx: PolicyContext,
  rules: PolicyCheck[] = DEFAULT_POLICY_RULES,
): PolicyDecision[] {
  return rules.map((rule) => rule(ctx));
}

export function policySummary(decisions: PolicyDecision[]) {
  const denied = decisions.filter((d) => !d.allow);
  const warnings = decisions.filter((d) => d.metadata?.warning);
  return {
    allowed: denied.length === 0,
    deniedCodes: denied.map((d) => d.code),
    warningCodes: warnings.map((d) => d.code),
    decisions,
  };
}

export function assertPolicy(
  ctx: PolicyContext,
  rules: PolicyCheck[] = DEFAULT_POLICY_RULES,
): PolicyDecision[] {
  const decisions = evaluatePolicy(ctx, rules);
  const denied = decisions.find((d) => !d.allow);
  if (denied) {
    throw new PolicyViolationError(denied.code, denied.reason || 'Policy denied', {
      tenantId: ctx.tenantId,
      actorId: ctx.actorId,
      actorType: ctx.actorType,
      requestedAction: ctx.requestedAction,
      channel: ctx.channel,
      dealId: ctx.dealId,
      leadId: ctx.leadId,
      messageId: ctx.messageId,
    });
  }
  return decisions;
}
