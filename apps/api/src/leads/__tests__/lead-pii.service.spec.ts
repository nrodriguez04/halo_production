import { LeadPiiService } from '../lead-pii.service';
import { maskEmail, maskPhone } from '../lead-pii';

describe('LeadPiiService', () => {
  const service = new LeadPiiService();

  beforeEach(() => {
    process.env.PII_ENCRYPTION_KEY_V1 = 'ab'.repeat(32);
    process.env.PII_ENCRYPTION_KEY_CURRENT_VERSION = '1';
    process.env.PII_INDEX_KEY = 'cd'.repeat(32);
  });

  it('stores only ciphertext and blind index, and round-trips through reveal', () => {
    const out = service.protect({
      phone: '+15125550100',
      email: 'Seller@Example.com',
    });

    expect(Object.keys(out).sort()).toEqual([
      'canonicalEmailEnc',
      'canonicalEmailHash',
      'canonicalPhoneEnc',
      'canonicalPhoneHash',
    ]);
    expect(out.canonicalPhoneEnc).not.toContain('5550100');
    expect(service.reveal(out)).toEqual({
      phone: '+15125550100',
      email: 'Seller@Example.com',
    });
  });

  it('touches only the fields provided and clears explicitly-null ones', () => {
    expect(service.protect({ phone: null })).toEqual({
      canonicalPhoneEnc: null,
      canonicalPhoneHash: null,
    });
    expect(service.protect({})).toEqual({});
    expect(service.protect({ email: '   ' }).canonicalEmailEnc).toBeNull();
    expect(service.reveal({})).toEqual({ phone: null, email: null });
  });

  it('produces the same blind index for equivalent formatting', () => {
    expect(service.phoneHash('(512) 555-0100')).toBe(
      service.phoneHash('+1 512 555 0100'),
    );
    expect(service.emailHash('A@B.co')).toBe(service.emailHash('a@b.co '));
  });

  describe('mask', () => {
    // Built per test: encryption needs the keys set in beforeEach.
    const row = () => ({
      id: 'lead-1',
      canonicalOwner: 'Jane Seller',
      ...service.protect({
        phone: '+15125550100',
        email: 'seller@example.com',
      }),
    });

    it('strips the protected columns and masks the contacts', () => {
      const out = service.mask(row());
      expect(out).toEqual({
        id: 'lead-1',
        canonicalOwner: 'Jane Seller',
        canonicalPhone: '••• ••• 0100',
        canonicalEmail: 's•••@example.com',
      });
      expect(out).not.toHaveProperty('canonicalPhoneEnc');
      expect(out).not.toHaveProperty('canonicalPhoneHash');
    });

    it('has no unmasked mode: reveals go through the audited PIIService', () => {
      expect((service as any).present).toBeUndefined();
      expect(service.mask.length).toBe(1);
    });

    it('leaves absent fields null', () => {
      expect(service.mask({ id: 'x' } as any)).toEqual({
        id: 'x',
        canonicalPhone: null,
        canonicalEmail: null,
      });
    });
  });

  it('mask helpers degrade safely on odd input', () => {
    expect(maskPhone('12')).toBe('•••');
    expect(maskEmail('not-an-email')).toBe('•••');
  });

  it('fails closed without keys', () => {
    delete process.env.PII_ENCRYPTION_KEY_V1;
    expect(() => service.protect({ phone: '+15125550100' })).toThrow(
      /PII encryption key/,
    );
  });
});
