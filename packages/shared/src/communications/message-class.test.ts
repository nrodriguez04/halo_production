import { classifyMessage, isInternalRecipient, switchesAllow, type ChannelSwitches } from './message-class';

const OFF: ChannelSwitches = { enabled: true, emailEnabled: false, smsEnabled: false, marketingEmailEnabled: false, marketingSmsEnabled: false };

describe('message classes', () => {
  it('classifies by type, then by whether it answers an inbound message', () => {
    expect(classifyMessage({ type: 'disposition_outreach' })).toBe('marketing');
    expect(classifyMessage({ type: 'buyer_blast' })).toBe('marketing');
    expect(classifyMessage({ type: 'offer_counter' })).toBe('conversational');
    expect(classifyMessage({ type: 'buyer_reply' })).toBe('conversational');
    expect(classifyMessage({ type: 'closing_update' })).toBe('transactional');
    expect(classifyMessage({ messageClass: 'internal_test' })).toBe('internal_test');
    expect(classifyMessage({ recipientType: 'seller', inReplyToMessageId: 'm1' })).toBe('conversational');
  });

  it('treats a message Halo starts without a known type as marketing, the stricter class', () => {
    expect(classifyMessage({ recipientType: 'seller' })).toBe('marketing');
    expect(classifyMessage(null)).toBe('marketing');
  });
});

describe('switches', () => {
  it('keeps everything off by default', () => {
    for (const cls of ['marketing', 'conversational', 'transactional'] as const) {
      expect(switchesAllow(cls, 'email', OFF).allowed).toBe(false);
      expect(switchesAllow(cls, 'sms', OFF).allowed).toBe(false);
    }
  });

  it('needs the marketing switch on top of the channel switch for marketing', () => {
    const email = { ...OFF, emailEnabled: true };
    expect(switchesAllow('transactional', 'email', email).allowed).toBe(true);
    expect(switchesAllow('conversational', 'email', email).allowed).toBe(true);
    const m = switchesAllow('marketing', 'email', email);
    expect(m.allowed).toBe(false);
    expect(m.reason).toContain('explicit authorization');
    expect(switchesAllow('marketing', 'email', { ...email, marketingEmailEnabled: true }).allowed).toBe(true);
    // Marketing email on does not turn marketing texts on.
    expect(switchesAllow('marketing', 'sms', { ...email, smsEnabled: true, marketingEmailEnabled: true }).allowed).toBe(false);
  });

  it('stops everything when side effects are off', () => {
    const all = { enabled: false, emailEnabled: true, smsEnabled: true, marketingEmailEnabled: true, marketingSmsEnabled: true };
    expect(switchesAllow('transactional', 'email', all).allowed).toBe(false);
  });

  it('matches the internal allowlist exactly', () => {
    const list = 'ops@halo.example, Owner@Halo.example';
    expect(isInternalRecipient('owner@halo.example', list)).toBe(true);
    expect(isInternalRecipient('evil-ops@halo.example', list)).toBe(false);
    expect(isInternalRecipient('ops@halo.example', '')).toBe(false);
  });
});
