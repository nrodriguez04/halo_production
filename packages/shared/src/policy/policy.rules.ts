import { PolicyCheck, PolicyContext, PolicyDecision } from './types';

function pass(code: string, metadata?: Record<string, any>): PolicyDecision {
  return { allow: true, code, metadata };
}

function deny(
  code: string,
  reason: string,
  metadata?: Record<string, any>,
): PolicyDecision {
  return { allow: false, code, reason, metadata };
}

const SIDE_EFFECT_ACTIONS = new Set([
  'comms.send_sms',
  'comms.send_email',
  'docusign.create_envelope',
  'buyer_blast.dispatch',
]);

const DRAFT_ACTIONS = new Set([
  'comms.create_draft',
  'marketing.generate_flyer_draft',
  'marketing.generate_buyer_blast_draft',
]);

function isMessagingChannel(channel: PolicyContext['channel']) {
  return channel === 'sms' || channel === 'email';
}

function isQuietHour(ctx: PolicyContext): boolean {
  if (typeof ctx.localHour !== 'number') return false;
  const startHour = 20;
  const endHour = 9;
  return ctx.localHour >= startHour || ctx.localHour < endHour;
}

export const sideEffectsRule: PolicyCheck = (ctx) => {
  const sideEffectsEnabled = ctx.sideEffectsEnabled ?? true;
  const messagingEnabled = ctx.messagingEnabled ?? true;

  if (!sideEffectsEnabled && SIDE_EFFECT_ACTIONS.has(ctx.requestedAction)) {
    return deny(
      'CONTROL_PLANE_SIDE_EFFECTS_DISABLED',
      'Global side effects are disabled by control plane',
    );
  }

  if (
    isMessagingChannel(ctx.channel) &&
    !messagingEnabled &&
    SIDE_EFFECT_ACTIONS.has(ctx.requestedAction)
  ) {
    return deny(
      'CONTROL_PLANE_MESSAGING_DISABLED',
      'Messaging is disabled by control plane',
    );
  }

  if (!sideEffectsEnabled && DRAFT_ACTIONS.has(ctx.requestedAction)) {
    return pass('DRAFT_ALLOWED_WHILE_SIDE_EFFECTS_DISABLED');
  }

  return pass('SIDE_EFFECTS_ALLOWED');
};

export const consentDncQuietHoursRule: PolicyCheck = (ctx) => {
  if (!isMessagingChannel(ctx.channel)) {
    return pass('NOT_MESSAGING_CHANNEL');
  }

  if (ctx.actorType === 'webhook') {
    return pass('INBOUND_OR_WEBHOOK_ALLOWED');
  }

  if (ctx.isDnc) {
    return deny('DNC_BLOCKED', 'Recipient is on DNC list');
  }

  if (ctx.hasConsent === false) {
    return deny('MISSING_CONSENT', 'Outbound messaging requires consent');
  }

  if (isQuietHour(ctx)) {
    return deny('QUIET_HOURS_BLOCKED', 'Outbound messaging blocked during quiet hours', {
      timezone: ctx.timezone ?? 'unknown',
      localHour: ctx.localHour,
    });
  }

  return pass('CONSENT_DNC_QUIET_HOURS_PASSED');
};

// Channels that consume AI spend. Extended to include every AI-driven
// pipeline (buyer-blast generation, video scripts, agent decisions) so
// they all enforce the same daily cap. Previously buyer_blast and
// marketing_video bypassed the rule entirely.
const AI_CHANNELS = new Set<PolicyContext['channel']>([
  'ai_underwrite',
  'marketing_flyer',
  'marketing_buyer_blast',
  'marketing_video',
  'agent_decision',
]);

export const aiCostCapRule: PolicyCheck = (ctx) => {
  const aiAction = AI_CHANNELS.has(ctx.channel);

  if (!aiAction) {
    return pass('NOT_AI_ACTION');
  }

  if (ctx.aiEnabled === false) {
    return deny('AI_DISABLED', 'AI actions disabled by control plane');
  }

  const tenantCap = ctx.perTenantCapUsd ?? ctx.dailyCapUsd;
  if (
    typeof tenantCap === 'number' &&
    typeof ctx.dailySpendUsd === 'number' &&
    ctx.dailySpendUsd >= tenantCap
  ) {
    return deny('TENANT_DAILY_CAP_REACHED', 'Tenant daily AI cap reached', {
      spend: ctx.dailySpendUsd,
      cap: tenantCap,
    });
  }

  if (
    typeof ctx.globalDailyCapUsd === 'number' &&
    typeof ctx.globalDailySpendUsd === 'number' &&
    ctx.globalDailySpendUsd >= ctx.globalDailyCapUsd
  ) {
    return deny('GLOBAL_DAILY_CAP_REACHED', 'Global daily AI cap reached', {
      spend: ctx.globalDailySpendUsd,
      cap: ctx.globalDailyCapUsd,
    });
  }

  if (
    typeof tenantCap === 'number' &&
    typeof ctx.dailySpendUsd === 'number' &&
    ctx.dailySpendUsd >= tenantCap * 0.8
  ) {
    return pass('AI_SPEND_WARNING_80', {
      warning: true,
      spend: ctx.dailySpendUsd,
      cap: tenantCap,
    });
  }

  return pass('AI_COST_WITHIN_CAP');
};

export const escalationRule: PolicyCheck = (ctx) => {
  if (
    typeof ctx.confidenceScore === 'number' &&
    ctx.confidenceScore < 0.5 &&
    SIDE_EFFECT_ACTIONS.has(ctx.requestedAction)
  ) {
    return deny(
      'REQUIRE_ESCALATION_LOW_CONFIDENCE',
      'Low confidence requires escalation before auto-execution',
    );
  }

  if ((ctx.legalRiskFlags ?? []).length > 0) {
    return deny(
      'REQUIRE_ESCALATION_LEGAL_RISK',
      'Legal risk flags require escalation',
      { legalRiskFlags: ctx.legalRiskFlags },
    );
  }

  return pass('NO_ESCALATION_REQUIRED');
};

export const negotiationBoundsRule: PolicyCheck = (ctx) => {
  if (
    typeof ctx.minOffer !== 'number' ||
    typeof ctx.maxOffer !== 'number' ||
    typeof ctx.proposedOffer !== 'number'
  ) {
    return pass('NEGOTIATION_BOUNDS_NOT_APPLICABLE');
  }

  if (ctx.proposedOffer < ctx.minOffer || ctx.proposedOffer > ctx.maxOffer) {
    return deny(
      'OFFER_OUT_OF_BOUNDS',
      'Proposed offer is outside configured bounds',
      {
        proposedOffer: ctx.proposedOffer,
        minOffer: ctx.minOffer,
        maxOffer: ctx.maxOffer,
      },
    );
  }

  return pass('OFFER_WITHIN_BOUNDS');
};

export const DEFAULT_POLICY_RULES: PolicyCheck[] = [
  sideEffectsRule,
  consentDncQuietHoursRule,
  aiCostCapRule,
  escalationRule,
  negotiationBoundsRule,
];
