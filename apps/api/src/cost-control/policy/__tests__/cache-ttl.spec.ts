import { defaultCacheTtlSec } from '../cache-ttl';

describe('defaultCacheTtlSec', () => {
  it('never caches a model completion, whichever provider serves it', () => {
    expect(defaultCacheTtlSec('openai', 'chat_completion.gpt-4o')).toBe(0);
    expect(
      defaultCacheTtlSec('anthropic', 'chat_completion.claude-opus-5-5'),
    ).toBe(0);
    expect(
      defaultCacheTtlSec(
        'anthropic',
        'chat_completion.claude-model-of-the-future',
      ),
    ).toBe(0);
  });

  it('keeps the per-action table for deterministic lookups', () => {
    expect(defaultCacheTtlSec('google_geocoding', 'geocode')).toBe(
      60 * 60 * 24 * 365,
    );
    expect(defaultCacheTtlSec('twilio', 'send_sms')).toBe(0);
  });
});
