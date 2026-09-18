import { normalizePhoneNumber } from '@halo/shared';
import { openValue, protectEmail, protectPhone } from '../pii/contact-crypto';

/**
 * The external party on a message: the recipient of an outbound message,
 * the sender of an inbound one. Stored on `messages` as envelope ciphertext
 * plus a blind index (`counterpartyEnc` / `counterpartyHash`) so inbound
 * attribution is an indexed equality lookup and no phone or email sits in
 * plaintext JSON. These keys used to live in `metadata`; the backfill moves
 * them and every write path here strips them.
 */
export const RECIPIENT_METADATA_KEYS = [
  'to',
  'phone',
  'email',
  'from',
] as const;

type Meta = Record<string, unknown> | null | undefined;

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/** Legacy: the address a caller put in metadata, by channel and direction. */
export function recipientFromMetadata(
  channel: string,
  metadata: Meta,
  direction: 'inbound' | 'outbound' = 'outbound',
): string | null {
  const m = metadata ?? {};
  if (direction === 'inbound') return str(m.from);
  if (channel === 'sms') return str(m.phone) ?? str(m.to);
  return str(m.email) ?? str(m.to);
}

export interface CounterpartyColumns {
  counterpartyEnc: string | null;
  counterpartyHash: string | null;
}

export function counterpartyColumns(
  channel: string,
  value: string | null,
): CounterpartyColumns {
  if (!value) return { counterpartyEnc: null, counterpartyHash: null };
  if (channel === 'sms') {
    const p = protectPhone(normalizePhoneNumber(value));
    return { counterpartyEnc: p.phoneEnc, counterpartyHash: p.phoneHash };
  }
  const e = protectEmail(value);
  return { counterpartyEnc: e.emailEnc, counterpartyHash: e.emailHash };
}

export function stripRecipientKeys(metadata: Meta): Record<string, unknown> {
  const out: Record<string, unknown> = { ...(metadata ?? {}) };
  for (const key of RECIPIENT_METADATA_KEYS) delete out[key];
  return out;
}

export function openCounterparty(row: {
  counterpartyEnc?: string | null;
}): string | null {
  return row.counterpartyEnc ? openValue(row.counterpartyEnc) : null;
}

/** Column first; metadata only for rows the backfill has not reached. */
export function messageCounterparty(row: {
  channel: string;
  direction: string;
  metadata?: unknown;
  counterpartyEnc?: string | null;
}): string | null {
  return (
    openCounterparty(row) ??
    recipientFromMetadata(
      row.channel,
      row.metadata as Meta,
      row.direction === 'inbound' ? 'inbound' : 'outbound',
    )
  );
}
