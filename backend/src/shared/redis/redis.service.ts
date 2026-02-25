import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { StructuredLoggerService } from '../services/structured-logger.service';

type RedisClient = {
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  on: (event: string, callback: (error: Error) => void) => void;
  ping: () => Promise<string>;
  get: (key: string) => Promise<string | null>;
  set: (...args: Array<string | number>) => Promise<string | null>;
  del: (...keys: string[]) => Promise<number>;
  exists: (key: string) => Promise<number>;
  incr: (key: string) => Promise<number>;
  expire: (key: string, seconds: number) => Promise<number>;
};

type RedisConstructor = new (...args: any[]) => RedisClient;

@Injectable()
export class RedisService implements OnModuleDestroy {
  private client: RedisClient | null = null;
  private initialized = false;

  constructor(private readonly logger: StructuredLoggerService) {}

  async ping() {
    const redis = await this.getClient();
    return redis.ping();
  }

  async get(key: string) {
    const redis = await this.getClient();
    return redis.get(key);
  }

  async set(
    key: string,
    value: string,
    options?: {
      ttlMs?: number;
      nx?: boolean;
    },
  ) {
    const redis = await this.getClient();
    const args: Array<string | number> = [key, value];

    if (options?.ttlMs) {
      args.push('PX', options.ttlMs);
    }
    if (options?.nx) {
      args.push('NX');
    }

    return redis.set(...args);
  }

  async del(...keys: string[]) {
    if (!keys.length) return 0;
    const redis = await this.getClient();
    return redis.del(...keys);
  }

  async exists(key: string) {
    const redis = await this.getClient();
    return redis.exists(key);
  }

  async incr(key: string) {
    const redis = await this.getClient();
    return redis.incr(key);
  }

  async expire(key: string, seconds: number) {
    const redis = await this.getClient();
    return redis.expire(key, seconds);
  }

  isReady() {
    return this.client !== null;
  }

  async onModuleDestroy() {
    if (!this.client) return;
    try {
      await this.client.disconnect();
    } catch {
      // Ignore shutdown errors.
    } finally {
      this.client = null;
    }
  }

  private async getClient() {
    if (this.client) return this.client;
    await this.initialize();
    if (!this.client) {
      throw new Error('Redis client unavailable');
    }
    return this.client;
  }

  private async initialize() {
    if (this.initialized) return;
    this.initialized = true;

    const RedisCtor = this.getRedisConstructor();
    if (!RedisCtor) {
      this.logger.warn({
        event: 'redis_dependency_missing',
        message: 'Pacote ioredis nao encontrado. Redis desabilitado.',
      });
      return;
    }

    const redisUrl = process.env.REDIS_URL?.trim();
    const host = process.env.REDIS_HOST?.trim() || '127.0.0.1';
    const port = this.parsePositiveInt(process.env.REDIS_PORT, 6379);
    const password = process.env.REDIS_PASSWORD?.trim() || undefined;
    const db = this.parsePositiveInt(process.env.REDIS_DB, 0);

    const options = {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
    };

    const client = redisUrl
      ? new RedisCtor(redisUrl, options)
      : new RedisCtor({
          host,
          port,
          password,
          db,
          ...options,
        });

    client.on('error', (error: Error) => {
      this.logger.warn({
        event: 'redis_runtime_error',
        message: error.message,
      });
    });

    try {
      await client.connect();
      this.client = client;
      this.logger.info({
        event: 'redis_connected',
        host: redisUrl ? redisUrl : host,
        port: redisUrl ? null : port,
      });
    } catch (error) {
      const err = error as Error;
      this.logger.warn({
        event: 'redis_connect_failed',
        message: err.message,
      });
    }
  }

  private getRedisConstructor(): RedisConstructor | null {
    try {
      const dynamicRequire = eval('require') as NodeJS.Require;
      return dynamicRequire('ioredis') as RedisConstructor;
    } catch {
      return null;
    }
  }

  private parsePositiveInt(value: string | undefined, fallback: number) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return fallback;
    return Math.floor(parsed);
  }
}

