import { UnauthorizedException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { AuthService } from '../auth/auth.service';

function createContext() {
  const tx = {
    refreshSession: {
      update: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    user: {
      update: jest.fn(),
    },
    passwordResetToken: {
      updateMany: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
  };

  const prisma = {
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    refreshSession: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    passwordResetToken: {
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
    $transaction: jest.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) =>
      callback(tx),
    ),
  };

  const jwt = {
    sign: jest.fn(),
    verify: jest.fn(),
    decode: jest.fn(),
  };

  const passwordResetDeliveryService = {
    sendResetInstructions: jest.fn(),
  };

  return { prisma, tx, jwt, passwordResetDeliveryService };
}

describe('AuthService refresh sessions', () => {
  it('creates a persisted refresh session when logging in', async () => {
    const { prisma, jwt, passwordResetDeliveryService } = createContext();
    const service = new AuthService(prisma as any, jwt as any, passwordResetDeliveryService as any);

    jwt.sign.mockImplementation((payload: { typ: 'access' | 'refresh' }) =>
      payload.typ === 'access' ? 'access-token' : 'refresh-token',
    );
    jwt.decode.mockReturnValue({
      exp: Math.floor((Date.now() + 30 * 24 * 60 * 60 * 1000) / 1000),
    });

    const user = {
      id: 'u1',
      name: 'Joao',
      email: 'joao@email.com',
      phone: null,
      homeId: 'h1',
    };

    const result = await service.login(user, {
      ipAddress: '127.0.0.1',
      userAgent: 'jest',
    });

    expect(result).toEqual(
      expect.objectContaining({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      }),
    );
    expect(prisma.refreshSession.create).toHaveBeenCalled();
  });

  it('rotates refresh session on /auth/refresh', async () => {
    const { prisma, tx, jwt, passwordResetDeliveryService } = createContext();
    const service = new AuthService(prisma as any, jwt as any, passwordResetDeliveryService as any);

    const currentRefreshToken = 'refresh-token-current';
    const currentTokenHash = createHash('sha256').update(currentRefreshToken).digest('hex');

    jwt.verify.mockReturnValue({
      sub: 'u1',
      email: 'joao@email.com',
      sid: 'session-1',
      typ: 'refresh',
    });
    jwt.sign.mockImplementation((payload: { typ: 'access' | 'refresh' }) =>
      payload.typ === 'access' ? 'access-token-next' : 'refresh-token-next',
    );
    jwt.decode.mockImplementation((token: string) => {
      if (token === 'refresh-token-next') {
        return { exp: Math.floor((Date.now() + 30 * 24 * 60 * 60 * 1000) / 1000) };
      }
      return null;
    });

    prisma.refreshSession.findUnique.mockResolvedValueOnce({
      id: 'session-1',
      userId: 'u1',
      tokenHash: currentTokenHash,
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      user: {
        id: 'u1',
        name: 'Joao',
        email: 'joao@email.com',
        phone: null,
        homeId: 'h1',
      },
    });

    const result = await service.refreshToken(currentRefreshToken, {
      ipAddress: '127.0.0.1',
      userAgent: 'jest',
    });

    expect(result).toEqual({
      accessToken: 'access-token-next',
      refreshToken: 'refresh-token-next',
    });
    expect(tx.refreshSession.update).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: expect.objectContaining({
        revokedAt: expect.any(Date),
        replacedBySessionId: expect.any(String),
      }),
    });
    expect(tx.refreshSession.create).toHaveBeenCalled();
  });

  it('rejects refresh when persisted token hash does not match', async () => {
    const { prisma, jwt, passwordResetDeliveryService } = createContext();
    const service = new AuthService(prisma as any, jwt as any, passwordResetDeliveryService as any);

    prisma.refreshSession.updateMany.mockResolvedValueOnce({ count: 1 });

    jwt.verify.mockReturnValue({
      sub: 'u1',
      email: 'joao@email.com',
      sid: 'session-1',
      typ: 'refresh',
    });
    prisma.refreshSession.findUnique.mockResolvedValueOnce({
      id: 'session-1',
      userId: 'u1',
      tokenHash: 'another-hash',
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      user: {
        id: 'u1',
        name: 'Joao',
        email: 'joao@email.com',
        phone: null,
        homeId: 'h1',
      },
    });

    await expect(service.refreshToken('refresh-token-current')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('revokes current session on logout when session id is provided', async () => {
    const { prisma, jwt, passwordResetDeliveryService } = createContext();
    const service = new AuthService(prisma as any, jwt as any, passwordResetDeliveryService as any);

    prisma.refreshSession.updateMany.mockResolvedValueOnce({ count: 1 });
    prisma.user.findUnique.mockResolvedValueOnce({ homeId: 'h1' });

    const result = await service.logout('u1', 'session-1');

    expect(prisma.refreshSession.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        userId: 'u1',
        id: 'session-1',
      }),
      data: {
        revokedAt: expect.any(Date),
      },
    });
    expect(result).toEqual({
      ok: true,
      revokedSessions: 1,
    });
  });

  it('lists active sessions and marks current session', async () => {
    const { prisma, jwt, passwordResetDeliveryService } = createContext();
    const service = new AuthService(prisma as any, jwt as any, passwordResetDeliveryService as any);

    prisma.refreshSession.findMany.mockResolvedValueOnce([
      {
        id: 'session-1',
        createdAt: new Date(),
        lastUsedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
        ipAddress: '127.0.0.1',
        userAgent: 'jest',
      },
      {
        id: 'session-2',
        createdAt: new Date(),
        lastUsedAt: new Date(),
        expiresAt: new Date(Date.now() + 120_000),
        ipAddress: '127.0.0.2',
        userAgent: 'chrome',
      },
    ]);

    const result = await service.listSessions('u1', 'session-2');

    expect(result).toHaveLength(2);
    expect(result.find((session) => session.id === 'session-2')?.current).toBe(true);
  });

  it('revokes all sessions while keeping current when requested', async () => {
    const { prisma, jwt, passwordResetDeliveryService } = createContext();
    const service = new AuthService(prisma as any, jwt as any, passwordResetDeliveryService as any);

    prisma.refreshSession.updateMany.mockResolvedValueOnce({ count: 4 });
    prisma.user.findUnique.mockResolvedValueOnce({ homeId: 'h1' });

    const result = await service.logoutAll('u1', 'session-current', true);

    expect(prisma.refreshSession.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        userId: 'u1',
      }),
      data: {
        revokedAt: expect.any(Date),
      },
    });
    expect(result).toEqual({
      ok: true,
      revokedSessions: 4,
      keepCurrent: true,
    });
  });
});
