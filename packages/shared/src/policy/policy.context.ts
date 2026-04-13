import { PolicyContext } from './types';

export function buildPolicyContext(
  partial: Partial<PolicyContext> &
    Pick<
      PolicyContext,
      'tenantId' | 'requestedAction' | 'channel' | 'actorType'
    >,
): PolicyContext {
  return {
    tenantId: partial.tenantId,
    actorId: partial.actorId ?? null,
    actorType: partial.actorType,
    now: partial.now ?? new Date(),
    requestedAction: partial.requestedAction,
    channel: partial.channel,
    leadId: partial.leadId,
    dealId: partial.dealId,
    messageId: partial.messageId,
    hasConsent: partial.hasConsent,
    consentSource: partial.consentSource,
    isDnc: partial.isDnc,
    timezone: partial.timezone,
    localHour: partial.localHour,
    dailySpendUsd: partial.dailySpendUsd,
    dailyCapUsd: partial.dailyCapUsd,
    perTenantCapUsd: partial.perTenantCapUsd,
    globalDailySpendUsd: partial.globalDailySpendUsd,
    globalDailyCapUsd: partial.globalDailyCapUsd,
    sideEffectsEnabled: partial.sideEffectsEnabled,
    messagingEnabled: partial.messagingEnabled,
    aiEnabled: partial.aiEnabled,
    minOffer: partial.minOffer,
    maxOffer: partial.maxOffer,
    proposedOffer: partial.proposedOffer,
    confidenceScore: partial.confidenceScore,
    legalRiskFlags: partial.legalRiskFlags ?? [],
  };
}
