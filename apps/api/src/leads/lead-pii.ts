import { hashEmail, hashPhone } from '@halo/shared';
import {
  cleanValue,
  maskEmail,
  maskPhone,
  openValue,
  sealValue,
} from '../pii/contact-crypto';

export { maskEmail, maskPhone };

/**
 * Contact PII on a lead lives only as envelope ciphertext plus a blind-index
 * hash per field. These are pure functions so the backfill script and any
 * service can use them without the Nest container.
 */
export interface ContactInput {
  phone?: string | null;
  email?: string | null;
}

export interface ProtectedContact {
  canonicalPhoneEnc: string | null;
  canonicalEmailEnc: string | null;
  canonicalPhoneHash: string | null;
  canonicalEmailHash: string | null;
}

export interface ContactRow {
  canonicalPhoneEnc?: string | null;
  canonicalEmailEnc?: string | null;
  canonicalPhoneHash?: string | null;
  canonicalEmailHash?: string | null;
}

export interface Contact {
  phone: string | null;
  email: string | null;
}

const clean = cleanValue;
const seal = sealValue;
const open = openValue;

/** Every column a write needs, for whichever of phone/email is provided. */
export function protectContact(input: ContactInput): Partial<ProtectedContact> {
  const out: Partial<ProtectedContact> = {};
  if (input.phone !== undefined) {
    const phone = clean(input.phone);
    out.canonicalPhoneEnc = phone ? seal(phone) : null;
    out.canonicalPhoneHash = phone ? hashPhone(phone) : null;
  }
  if (input.email !== undefined) {
    const email = clean(input.email);
    out.canonicalEmailEnc = email ? seal(email) : null;
    out.canonicalEmailHash = email ? hashEmail(email) : null;
  }
  return out;
}

export function revealContact(row: ContactRow): Contact {
  return {
    phone: row.canonicalPhoneEnc ? open(row.canonicalPhoneEnc) : null,
    email: row.canonicalEmailEnc ? open(row.canonicalEmailEnc) : null,
  };
}

/**
 * Shape a lead row for an API response: the ciphertext and hash columns are
 * never sent, and `canonicalPhone` / `canonicalEmail` are populated with the
 * real values when `reveal` is set, masked otherwise. Keeps the response
 * contract the web app already uses.
 *
 * Only PIIService passes `reveal: true`, after writing the audit row for
 * the caller; everything else masks via LeadPiiService.mask.
 */
export function presentContact<T extends ContactRow>(
  row: T,
  reveal: boolean,
): Omit<T, keyof ContactRow> & {
  canonicalPhone: string | null;
  canonicalEmail: string | null;
} {
  const {
    canonicalPhoneEnc: _pe,
    canonicalEmailEnc: _ee,
    canonicalPhoneHash: _ph,
    canonicalEmailHash: _eh,
    ...rest
  } = row;
  const contact = revealContact(row);
  return {
    ...rest,
    canonicalPhone:
      contact.phone && !reveal ? maskPhone(contact.phone) : contact.phone,
    canonicalEmail:
      contact.email && !reveal ? maskEmail(contact.email) : contact.email,
  };
}
