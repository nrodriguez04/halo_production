import { brandName } from '../../communications/outbound-content';

/**
 * Replies to the standard SMS keywords, returned to Twilio as TwiML so they
 * go back on the same number without an extra API call.
 *
 * When Twilio's own opt-out management (Advanced Opt-Out) is configured to
 * answer keywords itself, set SMS_KEYWORD_REPLIES=provider so the contact
 * does not get two confirmations. The opt-out is recorded either way.
 */
export function keywordRepliesEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return (env.SMS_KEYWORD_REPLIES ?? 'app').trim().toLowerCase() !== 'provider';
}

export function optOutConfirmation(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return `${brandName(env)}: You have been unsubscribed and will not receive further messages.`;
}

export function helpReply(env: NodeJS.ProcessEnv = process.env): string {
  const contact = env.MESSAGING_HELP_CONTACT?.trim();
  return `${brandName(env)}: ${
    contact ? `For help, contact ${contact}. ` : ''
  }Reply STOP to opt out. Msg & data rates may apply.`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** A TwiML document: one reply message, or an empty response for none. */
export function twiml(reply: string | null): string {
  const body = reply ? `<Message>${escapeXml(reply)}</Message>` : '';
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`;
}
