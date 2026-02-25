import { BadRequestException } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';

function createContext() {
  const tx = {
    passwordResetToken: {
      updateMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    refreshSession: {
      updateMany: jest.fn(),
    },
    user: {
      update: jest.fn(),
    },
  };

  const prisma = {
    user: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    passwordResetToken: {
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    refreshSession: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
    $transaction: jest.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) =>
      callback(tx),
    ),
  };

  const jwt = {
    sign: jest.fn().mockReturnValue('token'),
    verify: jest.fn(),
    decode: jest.fn().mockReturnValue({
      exp: Math.floor((Date.now() + 30 * 60 * 1000) / 1000),
    }),
  };

  const passwordResetDeliveryService = {
    sendResetInstructions: jest.fn().mockResolvedValue({
      channel: 'email',
      delivered: true,
    }),
  };

  return { prisma, tx, jwt, passwordResetDeliveryService };
}

describe('AuthService password reset', () => {
  it('returns generic message when identifier does not exist', async () => {
    const { prisma, jwt, passwordResetDeliveryService } = createContext();
    const service = new AuthService(prisma as any, jwt as any, passwordResetDeliveryService as any);

    prisma.user.findFirst.mockResolvedValueOnce(null);

    const result = await service.requestPasswordReset('missing@email.com');

    expect(result).toEqual({
      message: 'Se o identificador existir, voce recebera instrucoes de recuperacao.',
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('creates password reset token when identifier exists', async () => {
    const { prisma, tx, jwt, passwordResetDeliveryService } = createContext();
    const service = new AuthService(prisma as any, jwt as any, passwordResetDeliveryService as any);

    prisma.user.findFirst.mockResolvedValueOnce({
      id: 'u1',
      email: 'user@email.com',
      phone: '+5511999999999',
      homeId: 'h1',
    });

    const result = await service.requestPasswordReset('user@email.com');

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(tx.passwordResetToken.updateMany).toHaveBeenCalled();
    expect(tx.passwordResetToken.create).toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        message: 'Se o identificador existir, voce recebera instrucoes de recuperacao.',
        resetToken: expect.any(String),
      }),
    );
  });

  it('throws bad request for invalid or expired reset token', async () => {
    const { prisma, jwt, passwordResetDeliveryService } = createContext();
    const service = new AuthService(prisma as any, jwt as any, passwordResetDeliveryService as any);

    prisma.passwordResetToken.findFirst.mockResolvedValueOnce(null);

    await expect(service.resetPassword('invalid-token', 'NovaSenha@123')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('resets password and invalidates previous tokens', async () => {
    const { prisma, tx, jwt, passwordResetDeliveryService } = createContext();
    const service = new AuthService(prisma as any, jwt as any, passwordResetDeliveryService as any);

    prisma.passwordResetToken.findFirst.mockResolvedValueOnce({
      id: 'prt1',
      userId: 'u1',
      user: {
        id: 'u1',
        homeId: 'h1',
      },
    });

    await service.resetPassword('valid-token', 'NovaSenha@123');

    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { password: expect.any(String) },
    });
    expect(tx.passwordResetToken.update).toHaveBeenCalledWith({
      where: { id: 'prt1' },
      data: { usedAt: expect.any(Date) },
    });
    expect(tx.passwordResetToken.updateMany).toHaveBeenCalled();
    expect(tx.refreshSession.updateMany).toHaveBeenCalled();
  });
});
