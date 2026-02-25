import { HttpException, HttpStatus, Injectable, Optional } from '@nestjs/common';
import { RedisService } from '../../../shared/redis/redis.service';

type AttemptState = {
  count: number;
  firstAttemptAt: number;
  blockedUntil?: number;
};

@Injectable()
export class AuthRateLimitService {
  private readonly attempts = new Map<string, AttemptState>();
  private readonly windowMs = this.parsePositiveInt(process.env.AUTH_WINDOW_MS, 15 * 60 * 1000);
  private readonly maxAttempts = this.parsePositiveInt(process.env.AUTH_MAX_ATTEMPTS, 7);
  private readonly blockMs = this.parsePositiveInt(process.env.AUTH_BLOCK_MS, 15 * 60 * 1000);
  private readonly redisPrefix = process.env.AUTH_REDIS_PREFIX?.trim() || 'auth:rate-limit';

  constructor(@Optional() private readonly redis?: RedisService) {}

  async assertAllowed(keys: string | string[]) {
    const normalizedKeys = this.normalizeKeys(keys);

    await Promise.all(
      normalizedKeys.map(async (key) => {
        if (await this.isRedisBlocked(key)) {
          throw new HttpException(
            'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }

        this.cleanup();
        const attempt = this.attempts.get(key);
        if (!attempt) return;

        if (attempt.blockedUntil && attempt.blockedUntil > Date.now()) {
          throw new HttpException(
            'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
      }),
    );
  }

  async registerFailure(keys: string | string[]) {
    const normalizedKeys = this.normalizeKeys(keys);
    await Promise.all(normalizedKeys.map((key) => this.registerFailureForKey(key)));
  }

  async registerSuccess(keys: string | string[]) {
    const normalizedKeys = this.normalizeKeys(keys);
    await Promise.all(normalizedKeys.map((key) => this.clearState(key)));
  }

  private async registerFailureForKey(key: string) {
    const persisted = await this.registerFailureInRedis(key);
    if (persisted) return;

    const now = Date.now();
    const current = this.attempts.get(key);

    if (!current || now - current.firstAttemptAt > this.windowMs) {
      this.attempts.set(key, { count: 1, firstAttemptAt: now });
      return;
    }

    const nextCount = current.count + 1;
    const blockedUntil = nextCount >= this.maxAttempts ? now + this.blockMs : undefined;
    this.attempts.set(key, {
      count: nextCount,
      firstAttemptAt: current.firstAttemptAt,
      blockedUntil,
    });
  }

  private async clearState(key: string) {
    const persisted = await this.clearRedisState(key);
    if (persisted) return;
    this.attempts.delete(key);
  }

  private async isRedisBlocked(key: string) {
    if (!this.redis) return false;

    try {
      const blocked = await this.redis.exists(this.blockedKey(key));
      return blocked > 0;
    } catch {
      return false;
    }
  }

  private async registerFailureInRedis(key: string) {
    if (!this.redis) return false;

    try {
      const blocked = await this.redis.exists(this.blockedKey(key));
      if (blocked > 0) {
        return true;
      }

      const currentCount = await this.redis.incr(this.counterKey(key));
      if (currentCount === 1) {
        await this.redis.expire(this.counterKey(key), Math.ceil(this.windowMs / 1000));
      }

      if (currentCount >= this.maxAttempts) {
        await this.redis.set(this.blockedKey(key), '1', { ttlMs: this.blockMs });
        await this.redis.del(this.counterKey(key));
      }

      return true;
    } catch {
      return false;
    }
  }

  private async clearRedisState(key: string) {
    if (!this.redis) return false;

    try {
      await this.redis.del(this.counterKey(key), this.blockedKey(key));
      return true;
    } catch {
      return false;
    }
  }

  private cleanup() {
    const now = Date.now();
    for (const [key, attempt] of this.attempts.entries()) {
      const expiredWindow = now - attempt.firstAttemptAt > this.windowMs;
      const expiredBlock = !attempt.blockedUntil || attempt.blockedUntil <= now;
      if (expiredWindow && expiredBlock) {
        this.attempts.delete(key);
      }
    }
  }

  private parsePositiveInt(value: string | undefined, fallback: number) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallback;
    }
    return Math.floor(parsed);
  }

  private normalizeKeys(keys: string | string[]) {
    const list = Array.isArray(keys) ? keys : [keys];
    return Array.from(
      new Set(
        list
          .map((key) => key.trim())
          .filter(Boolean),
      ),
    );
  }

  private counterKey(key: string) {
    return `${this.redisPrefix}:counter:${key}`;
  }

  private blockedKey(key: string) {
    return `${this.redisPrefix}:blocked:${key}`;
  }
}
