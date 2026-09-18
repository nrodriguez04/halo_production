import { createHmac } from 'crypto';
import { normalizePhoneNumber } from '../utils/compliance';

/**
 * Blind index for encrypted contact fields.
 *
 * A column encrypted with a random IV cannot be looked up by value, so every
 * exact-match path (inbound SMS attribution, dedupe, DNC) queries an HMAC of
 * the normalized value instead. The index key is separate from the
 * encryption key: leaking it reveals equality between rows, not the values.
 */
function getIndexKey(): Buffer {
  const hex = process.env.PII_INDEX_KEY;
  if (!hex) throw new Error('PII_INDEX_KEY is not set');
  const key = Buffer.from(hex, 'hex');
  if (key.length !== 32) {
    throw new Error('PII_INDEX_KEY must be 32 bytes (64 hex chars)');
  }
  return key;
}

export function hashPII(normalizedValue: string): string {
  return createHmac('sha256', getIndexKey()).update(normalizedValue, 'utf8').digest('hex');
}

/** Same number in any common US formatting hashes the same. */
export function phoneIndexValue(phone: string): string {
  return normalizePhoneNumber(phone.trim());
}

export function emailIndexValue(email: string): string {
  return email.trim().toLowerCase();
}

export function hashPhone(phone: string): string {
  return hashPII(phoneIndexValue(phone));
}

export function hashEmail(email: string): string {
  return hashPII(emailIndexValue(email));
}
