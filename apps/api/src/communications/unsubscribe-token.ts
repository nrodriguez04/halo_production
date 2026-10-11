import { createHmac, timingSafeEqual } from 'crypto';
import { hashPII } from '@halo/shared';

/**
 * Unsubscribe links name the message they arrived in, signed, so the link
 * carries no address and cannot be forged for someone else's message:
 * `<messageId>.<HMAC-SHA256(messageId)>`.
 *
 * The signing key is derived from PII_INDEX_KEY with a fixed label, so no
 * new secret has to be provisioned. Rotating the index key invalidates
 * links already sent; the page then says so instead of unsubscribing.
 */
const KEY_LABEL = 'halo:unsubscribe-token:v1';
const MESSAGE_ID = /^[A-Za-z0-9_-]{1,64}$/;

function signingKey(): Buffer {
  return Buffer.from(hashPII(KEY_LABEL), 'hex');
}

function sign(messageId: string): string {
  return createHmac('sha256', signingKey())
    .update(messageId)
    .digest('base64url');
}

export function unsubscribeToken(messageId: string): string {
  return `${messageId}.${sign(messageId)}`;
}

/** The message id a genuine token names, or null. */
export function verifyUnsubscribeToken(
  token: string | null | undefined,
): string | null {
  if (!token) return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const messageId = token.slice(0, dot);
  if (!MESSAGE_ID.test(messageId)) return null;
  const presented = Buffer.from(token.slice(dot + 1), 'utf8');
  const expected = Buffer.from(sign(messageId), 'utf8');
  return presented.length === expected.length &&
    timingSafeEqual(presented, expected)
    ? messageId
    : null;
}

export function unsubscribeUrl(
  publicApiUrl: string,
  messageId: string,
): string {
  return `${publicApiUrl.replace(/\/+$/, '')}/unsubscribe/${unsubscribeToken(messageId)}`;
}
