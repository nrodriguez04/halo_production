import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

export interface PIIEnvelopeData {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyVersion: number;
}

function getKey(version: number): Buffer {
  const envKey = process.env[`PII_ENCRYPTION_KEY_V${version}`];
  if (!envKey) {
    throw new Error(`PII encryption key not found for version ${version}`);
  }
  const key = Buffer.from(envKey, 'hex');
  if (key.length !== 32) {
    throw new Error(`PII encryption key V${version} must be 32 bytes (64 hex chars)`);
  }
  return key;
}

function getCurrentKeyVersion(): number {
  return parseInt(process.env.PII_ENCRYPTION_KEY_CURRENT_VERSION || '1', 10);
}

export function encryptPII(plaintext: string, keyVersion?: number): PIIEnvelopeData {
  const version = keyVersion ?? getCurrentKeyVersion();
  const key = getKey(version);
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv);
  let ciphertext = cipher.update(plaintext, 'utf8', 'base64');
  ciphertext += cipher.final('base64');
  const authTag = cipher.getAuthTag();

  return {
    ciphertext,
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    keyVersion: version,
  };
}

export function decryptPII(envelope: PIIEnvelopeData): string {
  const key = getKey(envelope.keyVersion);
  const iv = Buffer.from(envelope.iv, 'base64');
  const authTag = Buffer.from(envelope.authTag, 'base64');

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let plaintext = decipher.update(envelope.ciphertext, 'base64', 'utf8');
  plaintext += decipher.final('utf8');
  return plaintext;
}

export function reEncryptPII(envelope: PIIEnvelopeData, newVersion?: number): PIIEnvelopeData {
  const plaintext = decryptPII(envelope);
  return encryptPII(plaintext, newVersion);
}

export function needsRotation(envelope: PIIEnvelopeData): boolean {
  return envelope.keyVersion < getCurrentKeyVersion();
}
