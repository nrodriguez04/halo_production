import { Inject, Injectable, Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS } from '../../redis/redis.module';

// Token-bucket rate limiter backed by Redis. We use INCR + EXPIRE NX to
// implement a fixed-window counter per (providerKey, scope, accountId,
// windowSec). It's deliberately simple: each window has its own bucket
// keyed by floor(now / windowSec), so we don't need a separate refill
// schedule. When the count exceeds the limit, `tryConsume` returns the
// time when the next window starts.

export interface RateLimitDecision {
  allowed: boolean;
  retryAt?: Date;
  remaining?: number;
}

export interface RateLimitConfig {
  providerKey: string;
  windowSec: number;
  maxRequests: number;
  scope?: 'global' | 'per_account';
  accountId?: string;
}

@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async tryConsume(cfg: RateLimitConfig): Promise<RateLimitDecision> {
    const scope = cfg.scope ?? 'per_account';
    const bucket = scope === 'global' ? 'GLOBAL' : cfg.accountId ?? 'GLOBAL';
    const windowStart = Math.floor(Date.now() / 1000 / cfg.windowSec) * cfg.windowSec;
    const key = `cost:rl:${cfg.providerKey}:${scope}:${bucket}:${cfg.windowSec}:${windowStart}`;
    try {
      const count = await this.redis.incr(key);
      if (count === 1) {
        // Only set the TTL on the first increment in this window
        await this.redis.expire(key, cfg.windowSec + 5);
      }
      if (count > cfg.maxRequests) {
        return {
          allowed: false,
          retryAt: new Date((windowStart + cfg.windowSec) * 1000),
          remaining: 0,
        };
      }
      return { allowed: true, remaining: cfg.maxRequests - count };
    } catch (err) {
      // Fail open - we'd rather over-call than block on a Redis blip.
      // The hard cap on integration_budget_buckets is the real safety net.
      this.logger.warn(`rate limit check failed (${cfg.providerKey}): ${err}`);
      return { allowed: true, remaining: cfg.maxRequests };
    }
  }

  /**
   * Idempotency dedup. Returns the timestamp of the previous call if one
   * happened within `withinSec`; null otherwise. Implemented with SET NX EX.
   */
  async checkDuplicate(idempotencyKey: string, withinSec = 60): Promise<Date | null> {
    const key = `cost:idem:${idempotencyKey}`;
    try {
      const result = await this.redis.set(key, Date.now().toString(), 'EX', withinSec, 'NX');
      if (result === 'OK') return null;
      const prev = await this.redis.get(key);
      const ts = prev ? parseInt(prev, 10) : Date.now();
      return new Date(ts);
    } catch (err) {
      this.logger.warn(`idempotency check failed: ${err}`);
      return null;
    }
  }
}
