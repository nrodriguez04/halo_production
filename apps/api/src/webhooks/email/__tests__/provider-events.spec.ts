import { createHmac, generateKeyPairSync, sign } from 'crypto';
import {
  resendEvent,
  sendgridEvents,
  verifySendGridSignature,
  verifySvixSignature,
} from '../provider-events';

describe('email provider events', () => {
  describe('SendGrid signatures', () => {
    const { publicKey, privateKey } = generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
    });
    const pub = publicKey
      .export({ format: 'der', type: 'spki' })
      .toString('base64');
    const body = Buffer.from('[{"event":"delivered","sg_event_id":"e1"}]');
    const ts = '1793000000';
    const sig = sign('sha256', Buffer.concat([Buffer.from(ts), body]), {
      key: privateKey,
      dsaEncoding: 'der',
    }).toString('base64');

    it('accepts a request signed with the configured key', () => {
      expect(verifySendGridSignature(pub, sig, ts, body)).toBe(true);
    });

    it('refuses a changed body, a changed timestamp, another key or garbage', () => {
      expect(verifySendGridSignature(pub, sig, ts, Buffer.from('[]'))).toBe(
        false,
      );
      expect(verifySendGridSignature(pub, sig, '1793000001', body)).toBe(false);
      const other = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
        .publicKey.export({ format: 'der', type: 'spki' })
        .toString('base64');
      expect(verifySendGridSignature(other, sig, ts, body)).toBe(false);
      expect(verifySendGridSignature('not-a-key', sig, ts, body)).toBe(false);
    });
  });

  describe('Resend (Svix) signatures', () => {
    const secretBytes = Buffer.from('synthetic-secret-for-tests-only');
    const secret = `whsec_${secretBytes.toString('base64')}`;
    const body = Buffer.from('{"type":"email.delivered"}');
    const now = 1_793_000_000_000;
    const ts = String(now / 1000);
    const good = createHmac('sha256', secretBytes)
      .update(`msg_1.${ts}.`)
      .update(body)
      .digest('base64');

    it('accepts any matching v1 signature in the header', () => {
      expect(
        verifySvixSignature(
          secret,
          'msg_1',
          ts,
          body,
          `v1,bogus v1,${good}`,
          now,
        ),
      ).toBe(true);
    });

    it('refuses a wrong id, a stale timestamp or a tampered body', () => {
      expect(
        verifySvixSignature(secret, 'msg_2', ts, body, `v1,${good}`, now),
      ).toBe(false);
      expect(
        verifySvixSignature(
          secret,
          'msg_1',
          ts,
          body,
          `v1,${good}`,
          now + 10 * 60_000,
        ),
      ).toBe(false);
      expect(
        verifySvixSignature(
          secret,
          'msg_1',
          ts,
          Buffer.from('{}'),
          `v1,${good}`,
          now,
        ),
      ).toBe(false);
    });
  });

  it('maps SendGrid events, telling a hard bounce from a temporary block', () => {
    const events = sendgridEvents([
      {
        event: 'delivered',
        sg_event_id: 'a',
        sg_message_id: 'sg1.filter',
        halo_message_id: 'm1',
        timestamp: 1793000000,
      },
      {
        event: 'bounce',
        type: 'bounce',
        sg_event_id: 'b',
        halo_message_id: 'm1',
        reason: '550 no such user',
      },
      {
        event: 'bounce',
        type: 'blocked',
        sg_event_id: 'c',
        halo_message_id: 'm1',
      },
      { event: 'spamreport', sg_event_id: 'd', halo_message_id: 'm1' },
      { event: 'group_resubscribe', sg_event_id: 'e' },
      { event: 'delivered' },
    ]);
    expect(events.map((e) => [e.event, e.bounceType])).toEqual([
      ['delivered', null],
      ['bounce', 'hard'],
      ['bounce', 'soft'],
      ['complaint', null],
    ]);
    expect(events[0]).toMatchObject({
      providerMessageId: 'sg1',
      haloMessageId: 'm1',
      occurredAt: new Date(1793000000 * 1000),
    });
    expect(sendgridEvents({ not: 'an array' })).toEqual([]);
  });

  it('maps a Resend event by its Svix id', () => {
    expect(
      resendEvent(
        {
          type: 'email.bounced',
          created_at: '2026-10-22T10:00:00Z',
          data: {
            email_id: 're_1',
            bounce: { type: 'Permanent', message: 'mailbox full' },
          },
        },
        'msg_9',
      ),
    ).toMatchObject({
      provider: 'resend',
      providerEventId: 'msg_9',
      providerMessageId: 're_1',
      event: 'bounce',
      bounceType: 'hard',
      reason: 'mailbox full',
    });
    expect(
      resendEvent(
        { type: 'email.complained', data: { email_id: 're_1' } },
        'msg_10',
      )?.event,
    ).toBe('complaint');
    expect(resendEvent({ type: 'contact.created' }, 'msg_11')).toBeNull();
  });
});
