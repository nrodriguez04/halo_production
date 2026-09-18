import { hashEmail, hashPhone } from '@halo/shared';
import {
  counterpartyColumns,
  messageCounterparty,
  openCounterparty,
  recipientFromMetadata,
  stripRecipientKeys,
} from '../message-counterparty';

describe('message counterparty', () => {
  beforeAll(() => {
    process.env.PII_ENCRYPTION_KEY_V1 = '11'.repeat(32);
    process.env.PII_ENCRYPTION_KEY_CURRENT_VERSION = '1';
    process.env.PII_INDEX_KEY = '22'.repeat(32);
  });

  it('reads the legacy recipient keys by channel and direction', () => {
    expect(recipientFromMetadata('sms', { to: '+15125550100' })).toBe(
      '+15125550100',
    );
    expect(
      recipientFromMetadata('sms', { phone: '+15125550100', to: 'x' }),
    ).toBe('+15125550100');
    expect(recipientFromMetadata('email', { email: 'a@b.co', to: 'x' })).toBe(
      'a@b.co',
    );
    expect(recipientFromMetadata('email', { to: 'a@b.co' })).toBe('a@b.co');
    expect(
      recipientFromMetadata('sms', { from: '+15125550100' }, 'inbound'),
    ).toBe('+15125550100');
    expect(recipientFromMetadata('sms', { subject: 'hi' })).toBeNull();
    expect(recipientFromMetadata('sms', null)).toBeNull();
  });

  it('normalizes phones before hashing so formatting differences still match', () => {
    const a = counterpartyColumns('sms', '(512) 555-0100');
    const b = counterpartyColumns('sms', '+15125550100');
    expect(a.counterpartyHash).toBe(b.counterpartyHash);
    expect(a.counterpartyHash).toBe(hashPhone('+15125550100'));
    expect(openCounterparty(a)).toBe('+15125550100');
    expect(
      counterpartyColumns('email', 'Seller@Example.com').counterpartyHash,
    ).toBe(hashEmail('seller@example.com'));
    expect(counterpartyColumns('sms', null)).toEqual({
      counterpartyEnc: null,
      counterpartyHash: null,
    });
  });

  it('strips only the recipient keys from metadata', () => {
    expect(
      stripRecipientKeys({
        to: 'x',
        phone: 'y',
        email: 'z',
        from: 'w',
        subject: 'keep',
        numSegments: 2,
      }),
    ).toEqual({ subject: 'keep', numSegments: 2 });
    expect(stripRecipientKeys(undefined)).toEqual({});
  });

  it('prefers the encrypted column and falls back to legacy metadata', () => {
    const cols = counterpartyColumns('sms', '+15125550100');
    expect(
      messageCounterparty({
        channel: 'sms',
        direction: 'outbound',
        metadata: { to: 'stale' },
        ...cols,
      }),
    ).toBe('+15125550100');
    expect(
      messageCounterparty({
        channel: 'sms',
        direction: 'outbound',
        metadata: { to: '+15125550199' },
      }),
    ).toBe('+15125550199');
    expect(
      messageCounterparty({
        channel: 'sms',
        direction: 'inbound',
        metadata: { from: '+15125550177' },
      }),
    ).toBe('+15125550177');
  });
});
