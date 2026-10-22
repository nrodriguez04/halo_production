import { createHmac, createPublicKey, timingSafeEqual, verify } from 'crypto';

/**
 * Email provider event webhooks (docs/communications.md s5): what happened
 * to a message after it left. Signature checks and the mapping of each
 * provider's events onto one vocabulary. No I/O here.
 */

export type ProviderEventKind =
  | 'processed'
  | 'delivered'
  | 'deferred'
  | 'bounce'
  | 'dropped'
  | 'complaint'
  | 'unsubscribe'
  | 'open'
  | 'click';

export interface ProviderEvent {
  provider: 'sendgrid' | 'resend';
  providerEventId: string;
  /** Halo's message id, when the provider echoes it. */
  haloMessageId: string | null;
  /** The provider's id for the message, recorded at send. */
  providerMessageId: string | null;
  event: ProviderEventKind;
  bounceType: 'hard' | 'soft' | null;
  reason: string | null;
  occurredAt: Date;
}

/**
 * SendGrid's signed Event Webhook: an ECDSA (P-256, SHA-256) signature over
 * the timestamp header followed by the raw body, checked with the public
 * key shown in SendGrid's settings (base64 DER).
 */
export function verifySendGridSignature(
  publicKeyBase64: string,
  signatureBase64: string,
  timestamp: string,
  rawBody: Buffer,
): boolean {
  try {
    const key = createPublicKey({
      key: Buffer.from(publicKeyBase64, 'base64'),
      format: 'der',
      type: 'spki',
    });
    return verify(
      'sha256',
      Buffer.concat([Buffer.from(timestamp, 'utf8'), rawBody]),
      { key, dsaEncoding: 'der' },
      Buffer.from(signatureBase64, 'base64'),
    );
  } catch {
    return false;
  }
}

/**
 * Resend signs webhooks the Svix way: HMAC-SHA256 over
 * `${id}.${timestamp}.${body}` with the base64 secret after `whsec_`, sent
 * as one or more `v1,<base64>` entries. Timestamps older than five minutes
 * are refused, so a captured request cannot be replayed later.
 */
export function verifySvixSignature(
  secret: string,
  id: string,
  timestamp: string,
  rawBody: Buffer,
  signatureHeader: string,
  now = Date.now(),
): boolean {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(now / 1000 - ts) > 300) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = createHmac('sha256', key)
    .update(`${id}.${timestamp}.`)
    .update(rawBody)
    .digest();
  for (const part of signatureHeader.split(' ')) {
    const [version, sig] = part.split(',');
    if (version !== 'v1' || !sig) continue;
    const given = Buffer.from(sig, 'base64');
    if (given.length === expected.length && timingSafeEqual(given, expected))
      return true;
  }
  return false;
}

const SENDGRID_KINDS: Record<string, ProviderEventKind> = {
  processed: 'processed',
  delivered: 'delivered',
  deferred: 'deferred',
  bounce: 'bounce',
  dropped: 'dropped',
  spamreport: 'complaint',
  unsubscribe: 'unsubscribe',
  group_unsubscribe: 'unsubscribe',
  open: 'open',
  click: 'click',
};

/** SendGrid posts a JSON array of events; unknown kinds are skipped. */
export function sendgridEvents(body: unknown): ProviderEvent[] {
  if (!Array.isArray(body)) return [];
  const out: ProviderEvent[] = [];
  for (const raw of body) {
    const e = (raw ?? {}) as Record<string, unknown>;
    const kind = SENDGRID_KINDS[String(e.event ?? '')];
    const id = typeof e.sg_event_id === 'string' ? e.sg_event_id : null;
    if (!kind || !id) continue;
    const sgMessageId =
      typeof e.sg_message_id === 'string'
        ? e.sg_message_id.split('.')[0]
        : null;
    out.push({
      provider: 'sendgrid',
      providerEventId: id,
      haloMessageId:
        typeof e.halo_message_id === 'string' ? e.halo_message_id : null,
      providerMessageId: sgMessageId,
      event: kind,
      // SendGrid's "blocked" is a temporary refusal; "bounce" is permanent.
      bounceType:
        kind === 'bounce' ? (e.type === 'blocked' ? 'soft' : 'hard') : null,
      reason:
        typeof e.reason === 'string'
          ? e.reason.slice(0, 500)
          : typeof e.response === 'string'
            ? e.response.slice(0, 500)
            : null,
      occurredAt:
        typeof e.timestamp === 'number'
          ? new Date(e.timestamp * 1000)
          : new Date(),
    });
  }
  return out;
}

const RESEND_KINDS: Record<string, ProviderEventKind> = {
  'email.sent': 'processed',
  'email.delivered': 'delivered',
  'email.delivery_delayed': 'deferred',
  'email.bounced': 'bounce',
  'email.complained': 'complaint',
  'email.opened': 'open',
  'email.clicked': 'click',
};

/** One Resend webhook delivery is one event, identified by its Svix id. */
export function resendEvent(
  body: unknown,
  svixId: string,
): ProviderEvent | null {
  const b = (body ?? {}) as Record<string, unknown>;
  const kind = RESEND_KINDS[String(b.type ?? '')];
  const data = (b.data ?? {}) as Record<string, unknown>;
  if (!kind) return null;
  const bounce = (data.bounce ?? {}) as Record<string, unknown>;
  return {
    provider: 'resend',
    providerEventId: svixId,
    haloMessageId: null,
    providerMessageId: typeof data.email_id === 'string' ? data.email_id : null,
    event: kind,
    bounceType:
      kind === 'bounce'
        ? String(bounce.type ?? '').toLowerCase() === 'transient'
          ? 'soft'
          : 'hard'
        : null,
    reason:
      typeof bounce.message === 'string' ? bounce.message.slice(0, 500) : null,
    occurredAt:
      typeof b.created_at === 'string' ? new Date(b.created_at) : new Date(),
  };
}
