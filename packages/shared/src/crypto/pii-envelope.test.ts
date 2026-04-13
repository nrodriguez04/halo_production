import { randomBytes } from 'crypto';
import { encryptPII, decryptPII, reEncryptPII, needsRotation, PIIEnvelopeData } from './pii-envelope';

const TEST_KEY_V1 = randomBytes(32).toString('hex');
const TEST_KEY_V2 = randomBytes(32).toString('hex');

beforeAll(() => {
  process.env.PII_ENCRYPTION_KEY_V1 = TEST_KEY_V1;
  process.env.PII_ENCRYPTION_KEY_V2 = TEST_KEY_V2;
  process.env.PII_ENCRYPTION_KEY_CURRENT_VERSION = '1';
});

afterAll(() => {
  delete process.env.PII_ENCRYPTION_KEY_V1;
  delete process.env.PII_ENCRYPTION_KEY_V2;
  delete process.env.PII_ENCRYPTION_KEY_CURRENT_VERSION;
});

describe('PII Encryption', () => {
  const plaintext = 'John Doe, SSN: 123-45-6789';

  describe('encryptPII', () => {
    it('returns an envelope with ciphertext, iv, authTag, and keyVersion', () => {
      const envelope = encryptPII(plaintext);
      expect(envelope.ciphertext).toBeDefined();
      expect(envelope.iv).toBeDefined();
      expect(envelope.authTag).toBeDefined();
      expect(envelope.keyVersion).toBe(1);
    });

    it('produces different ciphertexts for the same input (random IV)', () => {
      const a = encryptPII(plaintext);
      const b = encryptPII(plaintext);
      expect(a.ciphertext).not.toEqual(b.ciphertext);
      expect(a.iv).not.toEqual(b.iv);
    });

    it('uses the specified key version', () => {
      const envelope = encryptPII(plaintext, 2);
      expect(envelope.keyVersion).toBe(2);
    });
  });

  describe('decryptPII', () => {
    it('decrypts back to the original plaintext', () => {
      const envelope = encryptPII(plaintext);
      const result = decryptPII(envelope);
      expect(result).toBe(plaintext);
    });

    it('handles empty strings', () => {
      const envelope = encryptPII('');
      const result = decryptPII(envelope);
      expect(result).toBe('');
    });

    it('handles unicode text', () => {
      const unicode = 'Héllo Wörld 日本語 🔐';
      const envelope = encryptPII(unicode);
      const result = decryptPII(envelope);
      expect(result).toBe(unicode);
    });

    it('fails with a tampered ciphertext', () => {
      const envelope = encryptPII(plaintext);
      const tampered: PIIEnvelopeData = {
        ...envelope,
        ciphertext: Buffer.from('tampered').toString('base64'),
      };
      expect(() => decryptPII(tampered)).toThrow();
    });

    it('fails with a tampered authTag', () => {
      const envelope = encryptPII(plaintext);
      const tampered: PIIEnvelopeData = {
        ...envelope,
        authTag: Buffer.from(randomBytes(16)).toString('base64'),
      };
      expect(() => decryptPII(tampered)).toThrow();
    });

    it('throws for missing key version', () => {
      const envelope = encryptPII(plaintext);
      envelope.keyVersion = 99;
      expect(() => decryptPII(envelope)).toThrow('PII encryption key not found');
    });
  });

  describe('reEncryptPII', () => {
    it('re-encrypts with the new key version', () => {
      const original = encryptPII(plaintext, 1);
      expect(original.keyVersion).toBe(1);

      const rotated = reEncryptPII(original, 2);
      expect(rotated.keyVersion).toBe(2);
      expect(rotated.ciphertext).not.toBe(original.ciphertext);

      const decrypted = decryptPII(rotated);
      expect(decrypted).toBe(plaintext);
    });
  });

  describe('needsRotation', () => {
    it('returns false when envelope uses current key version', () => {
      const envelope = encryptPII(plaintext);
      expect(needsRotation(envelope)).toBe(false);
    });

    it('returns true when envelope uses an older key version', () => {
      process.env.PII_ENCRYPTION_KEY_CURRENT_VERSION = '2';
      const envelope = encryptPII(plaintext, 1);
      expect(needsRotation(envelope)).toBe(true);
      process.env.PII_ENCRYPTION_KEY_CURRENT_VERSION = '1';
    });
  });
});
