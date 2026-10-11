import {
  maskEmail,
  maskPhone,
  openValue,
  protectEmail,
  protectPhone,
} from '../pii/contact-crypto';

/**
 * Buyer contact details live only as envelope ciphertext plus a blind-index
 * hash, the same as lead contacts (docs/pii-encryption-design.md). The API
 * keeps its `email` / `phone` contract: writes take plaintext, responses
 * carry masked values, or real ones via PIIService.presentBuyers.
 */
export interface BuyerContactInput {
  email?: string | null;
  phone?: string | null;
}

export interface BuyerContactRow {
  emailEnc?: string | null;
  emailHash?: string | null;
  phoneEnc?: string | null;
  phoneHash?: string | null;
}

/** Columns for whichever of email / phone is present in the input; null clears. */
export function protectBuyerContact(
  input: BuyerContactInput,
): Partial<Required<BuyerContactRow>> {
  const out: Partial<Required<BuyerContactRow>> = {};
  if (input.email !== undefined) Object.assign(out, protectEmail(input.email));
  if (input.phone !== undefined) Object.assign(out, protectPhone(input.phone));
  return out;
}

export function presentBuyerContact<T extends BuyerContactRow>(
  row: T,
  reveal: boolean,
): Omit<T, keyof BuyerContactRow> & {
  email: string | null;
  phone: string | null;
} {
  const { emailEnc, emailHash: _eh, phoneEnc, phoneHash: _ph, ...rest } = row;
  const email = emailEnc ? openValue(emailEnc) : null;
  const phone = phoneEnc ? openValue(phoneEnc) : null;
  return {
    ...rest,
    email: email && !reveal ? maskEmail(email) : email,
    phone: phone && !reveal ? maskPhone(phone) : phone,
  };
}
