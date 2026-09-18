import {
  decryptPII,
  encryptPII,
  hashEmail,
  hashPhone,
  type PIIEnvelopeData,
} from '@halo/shared';

/**
 * Contact PII on a lead: plaintext (dual-write phase), envelope ciphertext
 * and blind-index hash for each of phone and email. Pure functions so the
 * backfill script can use them without the Nest container.
 */
export interface ContactInput {
  phone?: string | null;
  email?: string | null;
}

export interface ProtectedContact {
  canonicalPhone: string | null;
  canonicalEmail: string | null;
  canonicalPhoneEnc: string | null;
  canonicalEmailEnc: string | null;
  canonicalPhoneHash: string | null;
  canonicalEmailHash: string | null;
}

export interface ContactRow {
  canonicalPhone?: string | null;
  canonicalEmail?: string | null;
  canonicalPhoneEnc?: string | null;
  canonicalEmailEnc?: string | null;
}

function clean(value: string | null | undefined): string | null {
  const v = value?.trim();
  return v ? v : null;
}

function seal(value: string): string {
  return JSON.stringify(encryptPII(value));
}

function open(enc: string): string {
  return decryptPII(JSON.parse(enc) as PIIEnvelopeData);
}

/** Every column a write needs, for whichever of phone/email is provided. */
export function protectContact(input: ContactInput): Partial<ProtectedContact> {
  const out: Partial<ProtectedContact> = {};
  if (input.phone !== undefined) {
    const phone = clean(input.phone);
    out.canonicalPhone = phone;
    out.canonicalPhoneEnc = phone ? seal(phone) : null;
    out.canonicalPhoneHash = phone ? hashPhone(phone) : null;
  }
  if (input.email !== undefined) {
    const email = clean(input.email);
    out.canonicalEmail = email;
    out.canonicalEmailEnc = email ? seal(email) : null;
    out.canonicalEmailHash = email ? hashEmail(email) : null;
  }
  return out;
}

/** Ciphertext wins when present; plaintext is the dual-write fallback. */
export function revealContact(row: ContactRow): {
  phone: string | null;
  email: string | null;
} {
  return {
    phone: row.canonicalPhoneEnc
      ? open(row.canonicalPhoneEnc)
      : (row.canonicalPhone ?? null),
    email: row.canonicalEmailEnc
      ? open(row.canonicalEmailEnc)
      : (row.canonicalEmail ?? null),
  };
}

/** True when a row still needs the backfill (plaintext present, no ciphertext). */
export function needsProtection(row: ContactRow): boolean {
  return (
    (!!row.canonicalPhone && !row.canonicalPhoneEnc) ||
    (!!row.canonicalEmail && !row.canonicalEmailEnc)
  );
}
