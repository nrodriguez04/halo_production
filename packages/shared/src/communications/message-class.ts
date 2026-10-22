/**
 * What kind of message this is, for the switches that allow it and the
 * rules that apply to it (docs/communications.md s2).
 *
 * - marketing: Halo starts the conversation to sell or solicit (a buyer
 *   campaign, a blast, a follow-up, a first approach to a seller).
 * - conversational: a reply to someone who wrote to Halo, or the next step
 *   in a negotiation they opened (a counteroffer to their offer).
 * - transactional: a notice about a deal the recipient is party to (a
 *   document to sign, a closing date, a required disclosure).
 * - internal_test: a test to the operator's own allowlisted address.
 *
 * Marketing needs its own switch on top of the channel switch, so turning
 * email on for deal paperwork never turns campaigns on.
 */

export const MESSAGE_CLASSES = ['marketing', 'conversational', 'transactional', 'internal_test'] as const;
export type MessageClass = (typeof MESSAGE_CLASSES)[number];

/** Message types that are marketing whoever receives them. */
export const MARKETING_MESSAGE_TYPES: ReadonlySet<string> = new Set([
  'buyer_blast',
  'disposition_outreach',
  'disposition_follow_up',
  'seller_outreach',
  'seller_follow_up',
]);

/** Message types that are replies or the next step in a conversation the recipient opened. */
export const CONVERSATIONAL_MESSAGE_TYPES: ReadonlySet<string> = new Set([
  'buyer_reply',
  'seller_reply',
  'offer_counter',
  'offer_declined',
]);

export const TRANSACTIONAL_MESSAGE_TYPES: ReadonlySet<string> = new Set([
  'document_for_signature',
  'closing_update',
  'disclosure_delivery',
  'assignment_notice',
  'deal_page_confirmation',
]);

export function classifyMessage(metadata: unknown): MessageClass {
  const m = (metadata && typeof metadata === 'object' ? metadata : {}) as Record<string, unknown>;
  const type = typeof m.type === 'string' ? m.type : null;
  if (m.messageClass === 'internal_test' || type === 'internal_test') return 'internal_test';
  if (type && MARKETING_MESSAGE_TYPES.has(type)) return 'marketing';
  if (type && CONVERSATIONAL_MESSAGE_TYPES.has(type)) return 'conversational';
  if (type && TRANSACTIONAL_MESSAGE_TYPES.has(type)) return 'transactional';
  // A message answering an inbound one is a reply; anything else Halo
  // starts is treated as marketing, the stricter class.
  if (m.inReplyToMessageId || m.inReplyTo) return 'conversational';
  return 'marketing';
}

export interface ChannelSwitches {
  enabled: boolean;
  emailEnabled: boolean;
  smsEnabled: boolean;
  marketingEmailEnabled: boolean;
  marketingSmsEnabled: boolean;
}

/**
 * Whether the switches allow a message of this class on this channel.
 * Internal tests are decided by the allowlist, not here.
 */
export function switchesAllow(
  cls: MessageClass,
  channel: 'email' | 'sms',
  s: ChannelSwitches,
): { allowed: boolean; reason: string } {
  if (cls === 'internal_test') return { allowed: true, reason: 'Internal test: checked against the allowlist.' };
  if (!s.enabled) return { allowed: false, reason: 'Side effects are switched off on the Control Plane.' };
  const channelOn = channel === 'email' ? s.emailEnabled : s.smsEnabled;
  if (!channelOn) return { allowed: false, reason: `${channel === 'email' ? 'Email' : 'SMS'} is switched off on the Control Plane.` };
  if (cls === 'marketing') {
    const marketingOn = channel === 'email' ? s.marketingEmailEnabled : s.marketingSmsEnabled;
    if (!marketingOn) {
      return {
        allowed: false,
        reason: `Marketing ${channel === 'email' ? 'email' : 'texts'} are switched off on the Control Plane; only an explicit authorization turns them on.`,
      };
    }
  }
  return { allowed: true, reason: 'Allowed by the Control Plane.' };
}

/** Whether an address is on the internal test allowlist (exact, case-insensitive). */
export function isInternalRecipient(address: string, allowlist: string | null | undefined): boolean {
  const a = address.trim().toLowerCase();
  if (!a || !allowlist) return false;
  return allowlist
    .split(/[,\s]+/)
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean)
    .includes(a);
}
