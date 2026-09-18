import { LeadPiiService } from '../lead-pii.service';
import { needsProtection } from '../lead-pii';

describe('LeadPiiService', () => {
  const service = new LeadPiiService();

  beforeEach(() => {
    process.env.PII_ENCRYPTION_KEY_V1 = 'ab'.repeat(32);
    process.env.PII_ENCRYPTION_KEY_CURRENT_VERSION = '1';
    process.env.PII_INDEX_KEY = 'cd'.repeat(32);
  });

  it('round-trips phone and email through the envelope', () => {
    const out = service.protect({
      phone: '+15125550100',
      email: 'Seller@Example.com',
    });

    expect(out.canonicalPhone).toBe('+15125550100');
    expect(out.canonicalEmail).toBe('Seller@Example.com');
    expect(out.canonicalPhoneEnc).not.toContain('5550100');
    expect(service.reveal(out)).toEqual({
      phone: '+15125550100',
      email: 'Seller@Example.com',
    });
  });

  it('prefers ciphertext over a stale plaintext column', () => {
    const out = service.protect({ phone: '+15125550100' });
    expect(service.reveal({ ...out, canonicalPhone: 'stale' }).phone).toBe(
      '+15125550100',
    );
  });

  it('falls back to plaintext for rows the backfill has not reached', () => {
    expect(
      service.reveal({
        canonicalPhone: '+15125550100',
        canonicalPhoneEnc: null,
      }),
    ).toEqual({
      phone: '+15125550100',
      email: null,
    });
    expect(
      needsProtection({
        canonicalPhone: '+15125550100',
        canonicalPhoneEnc: null,
      }),
    ).toBe(true);
    expect(
      needsProtection({
        canonicalPhone: '+15125550100',
        canonicalPhoneEnc: '{}',
      }),
    ).toBe(false);
  });

  it('touches only the fields provided and clears explicitly-null ones', () => {
    expect(service.protect({ phone: null })).toEqual({
      canonicalPhone: null,
      canonicalPhoneEnc: null,
      canonicalPhoneHash: null,
    });
    expect(service.protect({})).toEqual({});
    expect(service.protect({ email: '   ' }).canonicalEmail).toBeNull();
  });

  it('produces the same blind index for equivalent formatting', () => {
    expect(service.phoneHash('(512) 555-0100')).toBe(
      service.phoneHash('+1 512 555 0100'),
    );
    expect(service.emailHash('A@B.co')).toBe(service.emailHash('a@b.co '));
  });

  it('fails closed without keys', () => {
    delete process.env.PII_ENCRYPTION_KEY_V1;
    expect(() => service.protect({ phone: '+15125550100' })).toThrow(
      /PII encryption key/,
    );
  });
});
