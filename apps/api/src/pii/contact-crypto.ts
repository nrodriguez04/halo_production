import {
  decryptPII,
  encryptPII,
  hashEmail,
  hashPhone,
  type PIIEnvelopeData,
} from '@halo/shared';

/**
 * Envelope + blind-index helpers for any table holding a phone or email.
 * lead-pii.ts wraps these with the lead column names; dnc_list and consents
 * use them directly. Pure functions: usable from scripts.
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
