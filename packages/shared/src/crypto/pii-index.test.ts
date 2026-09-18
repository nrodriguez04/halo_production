import { emailIndexValue, hashEmail, hashPII, hashPhone, phoneIndexValue } from './pii-index';

describe('pii blind index', () => {
  const KEY_A = 'a'.repeat(64);
  const KEY_B = 'b'.repeat(64);

  beforeEach(() => {
    process.env.PII_INDEX_KEY = KEY_A;
  });

  it('collapses phone formatting before hashing', () => {
    expect(phoneIndexValue('(512) 555-0100')).toBe('+15125550100');
    expect(phoneIndexValue('1-512-555-0100')).toBe('+15125550100');
    expect(hashPhone('(512) 555-0100')).toBe(hashPhone('+15125550100'));
  });

  it('lower-cases and trims email', () => {
    expect(emailIndexValue('  Seller@Example.COM ')).toBe('seller@example.com');
    expect(hashEmail('Seller@Example.com')).toBe(hashEmail('seller@example.com'));
  });

  it('is keyed: a different index key gives a different digest', () => {
    const a = hashPII('+15125550100');
    process.env.PII_INDEX_KEY = KEY_B;
    expect(hashPII('+15125550100')).not.toBe(a);
  });

  it('refuses a missing or short key', () => {
    delete process.env.PII_INDEX_KEY;
    expect(() => hashPII('x')).toThrow(/PII_INDEX_KEY/);
    process.env.PII_INDEX_KEY = 'abcd';
    expect(() => hashPII('x')).toThrow(/32 bytes/);
  });
});
