import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

@Injectable()
export class IntegrationSecretsService {
  private readonly logger = new Logger(IntegrationSecretsService.name);
  private readonly encryptionKey: Buffer;

  constructor(private prisma: PrismaService) {
    const keyHex = process.env.SECRETS_ENCRYPTION_KEY;
    if (keyHex && keyHex.length === 64) {
      this.encryptionKey = Buffer.from(keyHex, 'hex');
    } else if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'SECRETS_ENCRYPTION_KEY must be set to a 64-char hex string in production. ' +
          'Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
      );
    } else {
      this.encryptionKey = crypto
        .createHash('sha256')
        .update(process.env.DATABASE_URL || 'halo-dev-key')
        .digest();
      this.logger.warn(
        'SECRETS_ENCRYPTION_KEY not set — using derived key (dev only). ' +
          'Set a 64-char hex key for production.',
      );
    }
  }

  async setSecret(
    provider: string,
    keyName: string,
    plainValue: string,
    userId?: string,
  ) {
    const { ciphertext, iv, tag } = this.encrypt(plainValue);
    const maskedHint = this.maskValue(plainValue);

    return this.prisma.integrationSecret.upsert({
      where: {
        provider_keyName: { provider, keyName },
      },
      create: {
        provider,
        keyName,
        encryptedValue: ciphertext,
        iv,
        tag,
        maskedHint,
        setBy: userId,
      },
      update: {
        encryptedValue: ciphertext,
        iv,
        tag,
        maskedHint,
        setBy: userId,
      },
      select: {
        id: true,
        provider: true,
        keyName: true,
        maskedHint: true,
        updatedAt: true,
      },
    });
  }

  async getDecryptedValue(
    provider: string,
    keyName: string,
  ): Promise<string | null> {
    const secret = await this.prisma.integrationSecret.findUnique({
      where: { provider_keyName: { provider, keyName } },
    });

    if (!secret) return null;

    try {
      return this.decrypt(secret.encryptedValue, secret.iv, secret.tag);
    } catch (err) {
      this.logger.error(
        `Failed to decrypt secret ${provider}/${keyName}: ${err}`,
      );
      return null;
    }
  }

  /**
   * Resolve a secret: check DB first, fall back to env var.
   */
  async resolve(provider: string, keyName: string): Promise<string | null> {
    const fromDb = await this.getDecryptedValue(provider, keyName);
    if (fromDb) return fromDb;
    return process.env[keyName] || null;
  }

  async listSecrets() {
    return this.prisma.integrationSecret.findMany({
      select: {
        id: true,
        provider: true,
        keyName: true,
        maskedHint: true,
        updatedAt: true,
        setBy: true,
      },
      orderBy: [{ provider: 'asc' }, { keyName: 'asc' }],
    });
  }

  async deleteSecret(provider: string, keyName: string) {
    return this.prisma.integrationSecret.delete({
      where: { provider_keyName: { provider, keyName } },
    });
  }

  async hasSecret(provider: string, keyName: string): Promise<boolean> {
    const count = await this.prisma.integrationSecret.count({
      where: { provider, keyName },
    });
    return count > 0;
  }

  /**
   * Check connectivity for a given provider using its stored/env keys.
   */
  async testConnectivity(
    provider: string,
  ): Promise<{ connected: boolean; error?: string }> {
    try {
      switch (provider) {
        case 'twilio':
          return this.testTwilio();
        case 'attom':
          return this.testAttom();
        case 'openai':
          return this.testOpenAI();
        case 'google_geocoding':
          return this.testGoogleGeocoding();
        case 'sendgrid':
          return this.testSendGrid();
        case 'rentcast':
          return this.testRentCast();
        case 'propertyradar':
          return this.testPropertyRadar();
        case 'docusign':
          return { connected: false, error: 'DocuSign connectivity test requires OAuth flow' };
        case 'openclaw':
          return this.testOpenClaw();
        default:
          return { connected: false, error: `Unknown provider: ${provider}` };
      }
    } catch (err: any) {
      return { connected: false, error: err.message };
    }
  }

  // ---- crypto helpers ----

  private encrypt(plaintext: string): {
    ciphertext: string;
    iv: string;
    tag: string;
  } {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, this.encryptionKey, iv);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    return {
      ciphertext: encrypted.toString('base64'),
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
    };
  }

  private decrypt(
    ciphertextB64: string,
    ivB64: string,
    tagB64: string,
  ): string {
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      this.encryptionKey,
      Buffer.from(ivB64, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(ciphertextB64, 'base64')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  }

  private maskValue(value: string): string {
    if (value.length <= 4) return '••••';
    return '••••' + value.slice(-4);
  }

  // ---- connectivity tests ----

  private async testTwilio(): Promise<{ connected: boolean; error?: string }> {
    const sid = await this.resolve('twilio', 'TWILIO_ACCOUNT_SID');
    const token = await this.resolve('twilio', 'TWILIO_AUTH_TOKEN');
    if (!sid || !token) return { connected: false, error: 'Missing SID or Auth Token' };

    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}.json`,
      {
        headers: {
          Authorization:
            'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
        },
      },
    );
    if (res.ok) return { connected: true };
    return { connected: false, error: `HTTP ${res.status}` };
  }

  private async testAttom(): Promise<{ connected: boolean; error?: string }> {
    const key = await this.resolve('attom', 'ATTOM_API_KEY');
    if (!key) return { connected: false, error: 'Missing API key' };

    const res = await fetch(
      'https://api.gateway.attomdata.com/propertyapi/v1.0.0/property/expandedprofile?address=1600+Pennsylvania+Ave+NW,+Washington,+DC+20500',
      { headers: { apikey: key, Accept: 'application/json' } },
    );
    if (res.ok || res.status === 200) return { connected: true };
    if (res.status === 401 || res.status === 403)
      return { connected: false, error: 'Invalid API key' };
    return { connected: true };
  }

  private async testOpenAI(): Promise<{ connected: boolean; error?: string }> {
    const key = await this.resolve('openai', 'OPENAI_API_KEY');
    if (!key) return { connected: false, error: 'Missing API key' };

    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (res.ok) return { connected: true };
    if (res.status === 401)
      return { connected: false, error: 'Invalid API key' };
    return { connected: false, error: `HTTP ${res.status}` };
  }

  private async testGoogleGeocoding(): Promise<{
    connected: boolean;
    error?: string;
  }> {
    const key = await this.resolve(
      'google_geocoding',
      'GOOGLE_GEOCODING_API_KEY',
    );
    if (!key) return { connected: false, error: 'Missing API key' };

    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=1600+Amphitheatre+Parkway&key=${key}`,
    );
    const data = await res.json();
    if (data.status === 'OK' || data.status === 'ZERO_RESULTS')
      return { connected: true };
    return { connected: false, error: data.error_message || data.status };
  }

  private async testSendGrid(): Promise<{
    connected: boolean;
    error?: string;
  }> {
    const key = await this.resolve('sendgrid', 'SENDGRID_API_KEY');
    if (!key) return { connected: false, error: 'Missing API key' };

    const res = await fetch('https://api.sendgrid.com/v3/user/profile', {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (res.ok) return { connected: true };
    if (res.status === 401)
      return { connected: false, error: 'Invalid API key' };
    return { connected: false, error: `HTTP ${res.status}` };
  }

  private async testRentCast(): Promise<{
    connected: boolean;
    error?: string;
  }> {
    const key = await this.resolve('rentcast', 'RENTCAST_API_KEY');
    if (!key) return { connected: false, error: 'Missing API key' };

    const res = await fetch(
      'https://api.rentcast.io/v1/avm/value?address=1600+Pennsylvania+Ave+NW,+Washington,+DC+20500',
      { headers: { 'X-Api-Key': key, Accept: 'application/json' } },
    );
    if (res.ok || res.status === 404) return { connected: true };
    if (res.status === 401 || res.status === 403)
      return { connected: false, error: 'Invalid API key' };
    return { connected: false, error: `HTTP ${res.status}` };
  }

  private async testPropertyRadar(): Promise<{
    connected: boolean;
    error?: string;
  }> {
    const key = await this.resolve('propertyradar', 'PROPERTYRADAR_API_KEY');
    if (!key) return { connected: false, error: 'Missing API key' };

    const baseUrl =
      process.env.PROPERTYRADAR_BASE_URL || 'https://api.propertyradar.com/v1';
    const res = await fetch(`${baseUrl}/properties?Limit=1`, {
      headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
    });
    if (res.ok) return { connected: true };
    if (res.status === 401 || res.status === 403)
      return { connected: false, error: 'Invalid API key' };
    return { connected: false, error: `HTTP ${res.status}` };
  }

  private async testOpenClaw(): Promise<{
    connected: boolean;
    error?: string;
  }> {
    const enabled = process.env.FEATURE_OPENCLAW === 'true';
    if (!enabled) return { connected: false, error: 'FEATURE_OPENCLAW is not true' };
    return { connected: true };
  }
}
