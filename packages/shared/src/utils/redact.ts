// Free text that is about to be persisted (cost-ledger error metadata,
// timeline payloads) can echo a recipient back: Twilio's invalid-number
// errors quote the `To` number, and email providers quote the address. Those
// strings land in plaintext JSON columns, outside the encrypted contact
// fields, so they are scrubbed before they are written.

const EMAIL =
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;

// 10-15 digits, optionally led by `+` and broken up by spaces, dots, dashes
// or parentheses: every phone format a provider error is likely to quote.
// Not when glued to letters or digits, so ids and hex SIDs are left alone.
const PHONE =
  /(?<![A-Za-z0-9+])\+?\(?\d(?:[\s().-]{0,2}\d){9,14}(?![A-Za-z0-9])/g;

export function redactContactDetails(text: string): string;
export function redactContactDetails(
  text: string | null | undefined,
): string | null | undefined;
export function redactContactDetails(
  text: string | null | undefined,
): string | null | undefined {
  if (typeof text !== 'string') return text;
  return text.replace(EMAIL, '[email]').replace(PHONE, '[phone]');
}
