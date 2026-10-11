import {
  decryptPII,
  encryptPII,
  hashEmail,
  hashPhone,
  type PIIEnvelopeData,
} from '@halo/shared';

/**
 * Envelope + blind-index helpers for any table holding a phone or email.
 * lead-pii.ts wraps these with the lead column names; dnc_list, consents and
 * buyers use them directly. Pure functions: usable from scripts.
 */
export function sealValue(value: string): string {
  return JSON.stringify(encryptPII(value));
}

export function openValue(enc: string): string {
  return decryptPII(JSON.parse(enc) as PIIEnvelopeData);
}

export function cleanValue(value: string | null | undefined): string | null {
  const v = value?.trim();
  return v ? v : null;
}

export interface ProtectedPhone {
  phoneEnc: string | null;
  phoneHash: string | null;
}
export interface ProtectedEmail {
  emailEnc: string | null;
  emailHash: string | null;
}

export function protectPhone(phone: string | null | undefined): ProtectedPhone {
  const v = cleanValue(phone);
  return {
    phoneEnc: v ? sealValue(v) : null,
    phoneHash: v ? hashPhone(v) : null,
  };
}

export function protectEmail(email: string | null | undefined): ProtectedEmail {
  const v = cleanValue(email);
  return {
    emailEnc: v ? sealValue(v) : null,
    emailHash: v ? hashEmail(v) : null,
  };
}

/** `+1 512 555 0100` -> `••• ••• 0100`; anything shorter than 4 digits is fully masked. */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 4 ? `••• ••• ${digits.slice(-4)}` : '•••';
}

/** `seller@example.com` -> `s•••@example.com`. */
export function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return '•••';
  return `${email[0]}•••${email.slice(at)}`;
}

/**
 * JSON that carries contact data (a provider's contact payload kept for
 * provenance or caching) is stored as one envelope under this key, next to
 * whatever non-contact summary fields the caller keeps in the clear.
 */
export const SEALED_JSON_KEY = 'sealedPii';

export function sealJson(
  value: unknown,
  summary: Record<string, unknown> = {},
): Record<string, unknown> {
  return { ...summary, [SEALED_JSON_KEY]: sealValue(JSON.stringify(value)) };
}

export function isSealedJson(
  value: unknown,
): value is Record<string, unknown> & { sealedPii: string } {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof (value as Record<string, unknown>)[SEALED_JSON_KEY] === 'string'
  );
}

/** The original value of sealJson output; anything else is returned as is. */
export function openJson<T = unknown>(value: unknown): T {
  if (!isSealedJson(value)) return value as T;
  return JSON.parse(openValue(value[SEALED_JSON_KEY])) as T;
}
