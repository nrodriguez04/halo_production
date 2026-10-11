import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma.service';
import { openJson, sealJson } from '../../pii/contact-crypto';

// Provider response cache — keyed by sha256(provider + action +
// canonical(payload)). Backed by `cached_provider_responses`. Cache hits
// still write a row in `integration_cost_events` (status='cache_hit',
// actualCostUsd=0) so the dashboard can surface "cost saved by caching".
//
// Responses that carry contact data (skip-trace `append_contacts`, cached
// for 90 days) are written sealed (pii/contact-crypto sealJson) and opened
// on lookup; they used to sit in plaintext JSON.

export interface CacheLookupResult {
  payload: unknown;
  fetchedAt: Date;
  expiresAt: Date;
}

@Injectable()
export class ResponseCacheService {
  private readonly logger = new Logger(ResponseCacheService.name);

  constructor(private prisma: PrismaService) {}

  buildKey(provider: string, action: string, payload: unknown): string {
    const canonical = stringifyCanonical(payload);
    return crypto
      .createHash('sha256')
      .update(`${provider}:${action}:${canonical}`)
      .digest('hex');
  }

  async lookup(
    accountId: string,
    providerKey: string,
    cacheKey: string,
  ): Promise<CacheLookupResult | null> {
    try {
      const row = await this.prisma.cachedProviderResponse.findUnique({
        where: {
          accountId_providerKey_cacheKey: { accountId, providerKey, cacheKey },
        },
      });
      if (!row) return null;
      if (row.expiresAt.getTime() <= Date.now()) return null;
      return {
        payload: openJson(row.payload),
        fetchedAt: row.fetchedAt,
        expiresAt: row.expiresAt,
      };
    } catch (err) {
      this.logger.warn(`cache lookup failed (${providerKey}): ${err}`);
      return null;
    }
  }

  async write(params: {
    accountId: string;
    providerKey: string;
    cacheKey: string;
    payload: unknown;
    ttlSec: number;
    responseCode?: number;
    /** Seal the payload at rest: it contains contact PII. */
    sensitive?: boolean;
  }): Promise<void> {
    if (params.ttlSec <= 0) return;
    const expiresAt = new Date(Date.now() + params.ttlSec * 1000);
    const payload = (
      params.sensitive ? sealJson(params.payload) : params.payload
    ) as object;
    try {
      await this.prisma.cachedProviderResponse.upsert({
        where: {
          accountId_providerKey_cacheKey: {
            accountId: params.accountId,
            providerKey: params.providerKey,
            cacheKey: params.cacheKey,
          },
        },
        create: {
          accountId: params.accountId,
          providerKey: params.providerKey,
          cacheKey: params.cacheKey,
          payload,
          responseCode: params.responseCode,
          expiresAt,
        },
        update: {
          payload,
          responseCode: params.responseCode,
          fetchedAt: new Date(),
          expiresAt,
        },
      });
    } catch (err) {
      this.logger.warn(`cache write failed (${params.providerKey}): ${err}`);
    }
  }

  async recordHit(
    accountId: string,
    providerKey: string,
    cacheKey: string,
    costSavedUsd: number,
  ): Promise<void> {
    try {
      await this.prisma.cachedProviderResponse.update({
        where: {
          accountId_providerKey_cacheKey: { accountId, providerKey, cacheKey },
        },
        data: {
          hitCount: { increment: 1 },
          costSavedUsd: { increment: costSavedUsd },
        },
      });
    } catch (err) {
      this.logger.warn(`cache hit record failed: ${err}`);
    }
  }
}

// Stable stringify - sorts object keys recursively so equivalent payloads
// produce the same hash regardless of key order.
function stringifyCanonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(stringifyCanonical).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stringifyCanonical(obj[k])}`).join(',')}}`;
}
