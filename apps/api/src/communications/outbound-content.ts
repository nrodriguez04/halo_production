import { IntegrationUnavailableException } from '../integrations/integration-unavailable.exception';
import { unsubscribeUrl } from './unsubscribe-token';

/**
 * What actually goes to the provider for an approved message. Built here,
 * server-side, from the stored message, so every send carries the opt-out
 * mechanics the law and the carriers require no matter who wrote the copy:
 * SMS gets STOP instructions (CTIA), email gets an unsubscribe link and the
 * sender's postal address (CAN-SPAM) plus one-click List-Unsubscribe
 * headers (RFC 8058), and the email body is HTML-escaped.
 */

export const SMS_OPT_OUT_TEXT = 'Reply STOP to opt out.';

// "Reply STOP", "Text 'STOP'", "send STOP": the author already gave them.
const HAS_STOP_INSTRUCTION = /\b(?:reply|text|send)\s+["'‘’“”]?stop\b/i;

export function withSmsOptOut(content: string): string {
  const body = content.trimEnd();
  return HAS_STOP_INSTRUCTION.test(body)
    ? body
    : `${body}\n\n${SMS_OPT_OUT_TEXT}`;
}

export function brandName(env: NodeJS.ProcessEnv = process.env): string {
  return env.MESSAGING_BRAND_NAME?.trim() || 'Halo';
}

export interface EmailSettings {
  brandName: string;
  postalAddress: string;
  publicApiUrl: string;
  from: string;
  /** Reply-To for the inbound-email webhook's subdomain, when configured. */
  replyTo: string | null;
}

/**
 * Email cannot be sent compliantly without a physical postal address, a
 * public URL for the unsubscribe link and a sender, so a missing value
 * refuses the send (503 NOT_CONFIGURED) rather than mailing without them.
 */
export function emailSettings(
  env: NodeJS.ProcessEnv = process.env,
): EmailSettings {
  const postalAddress = env.EMAIL_POSTAL_ADDRESS?.trim();
  const publicApiUrl = env.PUBLIC_API_URL?.trim();
  const from = (env.EMAIL_FROM || env.SENDGRID_FROM_EMAIL)?.trim();
  const missing = [
    !postalAddress && 'EMAIL_POSTAL_ADDRESS',
    !publicApiUrl && 'PUBLIC_API_URL',
    !from && 'EMAIL_FROM',
  ].filter(Boolean);
  if (missing.length) {
    throw IntegrationUnavailableException.notConfigured(
      'email',
      missing.join(', '),
    );
  }
  return {
    brandName: brandName(env),
    postalAddress: postalAddress as string,
    publicApiUrl: publicApiUrl as string,
    from: from as string,
    replyTo: env.EMAIL_REPLY_TO?.trim() || null,
  };
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface ComposedEmail {
  subject: string;
  text: string;
  html: string;
  headers: Record<string, string>;
}

export function composeEmail(input: {
  messageId: string;
  content: string;
  subject?: unknown;
  settings: EmailSettings;
}): ComposedEmail {
  const { settings } = input;
  const link = unsubscribeUrl(settings.publicApiUrl, input.messageId);
  const subject =
    typeof input.subject === 'string' && input.subject.trim()
      ? input.subject
      : `Message from ${settings.brandName}`;

  const text = [
    input.content.trimEnd(),
    '',
    '--',
    settings.brandName,
    settings.postalAddress,
    `Unsubscribe: ${link}`,
  ].join('\n');

  const lines = (s: string) => escapeHtml(s).replace(/\r?\n/g, '<br>');
  const html =
    `<div>${lines(input.content.trimEnd())}</div>` +
    '<hr>' +
    '<p style="font-size:12px;color:#666">' +
    `${escapeHtml(settings.brandName)}<br>${lines(settings.postalAddress)}<br>` +
    `<a href="${escapeHtml(link)}">Unsubscribe</a>` +
    '</p>';

  return {
    // A header value; strip line breaks so a subject cannot add headers.
    subject: subject
      .replace(/[\r\n]+/g, ' ')
      .trim()
      .slice(0, 500),
    text,
    html,
    headers: {
      'List-Unsubscribe': `<${link}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  };
}
