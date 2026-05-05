export type PolicyActorType = 'user' | 'system' | 'webhook';

export type PolicyChannel =
  | 'sms'
  | 'email'
  | 'docusign'
  | 'buyer_blast'
  | 'ai_underwrite'
  | 'marketing_flyer'
  | 'marketing_buyer_blast'
  | 'marketing_video'
  | 'agent_decision'
  | 'other';

export interface PolicyContext {
  tenantId: string;
  actorId: string | null;
  actorType: PolicyActorType;
  now: Date;
  requestedAction: string;
  channel: PolicyChannel;
  leadId?: string;
  dealId?: string;
  messageId?: string;
  hasConsent?: boolean;
  consentSource?: string;
  isDnc?: boolean;
  timezone?: string;
  localHour?: number;
  dailySpendUsd?: number;
  dailyCapUsd?: number;
  perTenantCapUsd?: number;
  globalDailySpendUsd?: number;
  globalDailyCapUsd?: number;
  sideEffectsEnabled?: boolean;
  messagingEnabled?: boolean;
  aiEnabled?: boolean;
  minOffer?: number;
  maxOffer?: number;
  proposedOffer?: number;
  confidenceScore?: number;
  legalRiskFlags?: string[];
}

export interface PolicyDecision {
  allow: boolean;
  reason?: string;
  code: string;
  metadata?: Record<string, any>;
}

export type PolicyCheck = (ctx: PolicyContext) => PolicyDecision;
