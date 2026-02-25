import { JwtService } from '@nestjs/jwt';
import { HttpException, UnauthorizedException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { AuthService } from '../modules/auth/auth.service';
import { AuthRateLimitService } from '../modules/auth/services/auth-rate-limit.service';
import { NotificationService } from '../modules/notifications/notification.service';

const runIntegration = process.env.RUN_INTEGRATION_TESTS === 'true';
const describeIntegration = runIntegration ? describe : describe.skip;

describeIntegration('Integration (real DB + Redis)', () => {
  const prisma = new PrismaClient();
  let redis: Redis;
  let authService: AuthService;
  let authRateLimitService: AuthRateLimitService;
  let notificationService: NotificationService;

  const createdUserIds = new Set<string>();
  const createdHomeIds = new Set<string>();

  beforeAll(async () => {
    await prisma.$connect();

    const redisUrl = process.env.REDIS_URL?.trim() || 'redis://127.0.0.1:6379';
    redis = new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
    await redis.connect();
    await redis.ping();

    const jwtService = new JwtService({
      secret: process.env.JWT_SECRET || 'integration-secret',
      signOptions: {
        expiresIn: process.env.JWT_EXPIRES_IN || '15m',
      },
    });

    authService = new AuthService(prisma as any, jwtService, {
      sendResetInstructions: jest.fn(),
    } as any);

    authRateLimitService = new AuthRateLimitService({
      exists: (key: string) => redis.exists(key),
      incr: (key: string) => redis.incr(key),
      expire: (key: string, seconds: number) => redis.expire(key, seconds),
      set: (key: string, value: string, options?: { ttlMs?: number }) =>
        options?.ttlMs ? redis.set(key, value, 'PX', options.ttlMs) : redis.set(key, value),
      del: (...keys: string[]) => redis.del(...keys),
    } as any);

    notificationService = new NotificationService(prisma as any);
  });

  afterAll(async () => {
    if (createdUserIds.size > 0) {
      await prisma.user.deleteMany({
        where: {
          id: {
            in: Array.from(createdUserIds),
          },
        },
      });
    }

    if (createdHomeIds.size > 0) {
      await prisma.home.deleteMany({
        where: {
          id: {
            in: Array.from(createdHomeIds),
          },
        },
      });
    }

    if (redis) {
      await redis.quit();
    }

    await prisma.$disconnect();
  });

  it('persists and rotates refresh sessions end-to-end', async () => {
    const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const registerResult = await authService.register(
      {
        name: 'Integration User',
        email: `integration.${suffix}@casapp.dev`,
        phone: `+5511999${suffix.slice(-6)}`,
        password: 'Senha1234',
      } as any,
      {
        ipAddress: '127.0.0.1',
        userAgent: 'integration-test',
      },
    );

    createdUserIds.add(registerResult.user.id);
    if (registerResult.user.homeId) {
      createdHomeIds.add(registerResult.user.homeId);
    }

    const sessionsBefore = await authService.listSessions(registerResult.user.id);
    expect(sessionsBefore).toHaveLength(1);

    const refreshed = await authService.refreshToken(registerResult.refreshToken, {
      ipAddress: '127.0.0.1',
      userAgent: 'integration-test',
    });

    expect(refreshed.accessToken).toBeTruthy();
    expect(refreshed.refreshToken).toBeTruthy();
    expect(refreshed.refreshToken).not.toEqual(registerResult.refreshToken);

    const sessionsAfter = await authService.listSessions(registerResult.user.id);
    expect(sessionsAfter).toHaveLength(1);
    expect(sessionsAfter[0]?.id).not.toEqual(sessionsBefore[0]?.id);
  });

  it('enforces auth rate limit through Redis storage', async () => {
    const rateKey = `integration:rate:${Date.now()}`;

    for (let index = 0; index < 7; index += 1) {
      await authRateLimitService.registerFailure(rateKey);
    }

    await expect(authRateLimitService.assertAllowed(rateKey)).rejects.toBeInstanceOf(HttpException);
    await authRateLimitService.registerSuccess(rateKey);
    await expect(authRateLimitService.assertAllowed(rateKey)).resolves.toBeUndefined();
  });

  it('detects refresh token reuse and revokes active sessions', async () => {
    const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const registerResult = await authService.register(
      {
        name: 'Reuse User',
        email: `reuse.${suffix}@casapp.dev`,
        phone: `+5511888${suffix.slice(-6)}`,
        password: 'Senha1234',
      } as any,
      {
        ipAddress: '127.0.0.1',
        userAgent: 'integration-test',
      },
    );

    createdUserIds.add(registerResult.user.id);
    if (registerResult.user.homeId) {
      createdHomeIds.add(registerResult.user.homeId);
    }

    await authService.refreshToken(registerResult.refreshToken, {
      ipAddress: '127.0.0.1',
      userAgent: 'integration-test',
    });

    await expect(
      authService.refreshToken(registerResult.refreshToken, {
        ipAddress: '127.0.0.1',
        userAgent: 'integration-test',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    const sessions = await authService.listSessions(registerResult.user.id);
    expect(sessions).toHaveLength(0);
  });

  it('persists notifications and updates unread/read state', async () => {
    const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const registerResult = await authService.register(
      {
        name: 'Notification User',
        email: `notifications.${suffix}@casapp.dev`,
        phone: `+5511777${suffix.slice(-6)}`,
        password: 'Senha1234',
      } as any,
      {
        ipAddress: '127.0.0.1',
        userAgent: 'integration-test',
      },
    );

    createdUserIds.add(registerResult.user.id);
    if (registerResult.user.homeId) {
      createdHomeIds.add(registerResult.user.homeId);
    }

    await notificationService.notifyUser({
      userId: registerResult.user.id,
      homeId: registerResult.user.homeId,
      type: 'INTEGRATION_EVENT',
      title: 'Teste de notificacao',
      message: 'Mensagem de integracao',
      metadata: {
        source: 'integration-test',
      },
    });

    const unread = await notificationService.getUnreadCount(registerResult.user.id);
    expect(unread.count).toBeGreaterThan(0);

    const list = await notificationService.listForUser(registerResult.user.id, {
      page: 1,
      limit: 10,
      unreadOnly: true,
    });
    expect(list.data.length).toBeGreaterThan(0);

    const firstId = list.data[0]?.id;
    expect(firstId).toBeTruthy();

    if (firstId) {
      await notificationService.markRead(registerResult.user.id, firstId);
      const unreadAfterRead = await notificationService.getUnreadCount(registerResult.user.id);
      expect(unreadAfterRead.count).toBeLessThan(unread.count);
    }

    await notificationService.markAllRead(registerResult.user.id);
    const unreadAfterAll = await notificationService.getUnreadCount(registerResult.user.id);
    expect(unreadAfterAll.count).toBe(0);
  });
});
