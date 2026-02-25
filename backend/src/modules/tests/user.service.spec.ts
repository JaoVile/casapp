import { ForbiddenException } from '@nestjs/common';
import { UserService } from '../users/user.service';

function createPrismaMock() {
  return {
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    homeMember: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
    auditLog: {
      create: jest.fn(),
    },
  };
}

describe('UserService', () => {
  it('lists only users from requester home', async () => {
    const prisma = createPrismaMock();
    const service = new UserService(prisma as any);

    prisma.user.findUnique.mockResolvedValueOnce({ homeId: 'h1' });
    prisma.homeMember.findMany.mockResolvedValueOnce([
      { user: { id: 'u1', name: 'Joao', email: 'joao@email.com' } },
      { user: { id: 'u2', name: 'Ana', email: 'ana@email.com' } },
    ]);

    const result = await service.findAll('u1');

    expect(prisma.homeMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { homeId: 'h1' },
      }),
    );
    expect(result).toHaveLength(2);
  });

  it('blocks non-admin from deleting another member', async () => {
    const prisma = createPrismaMock();
    const service = new UserService(prisma as any);

    prisma.user.findUnique
      .mockResolvedValueOnce({ id: 'u1', homeId: 'h1' })
      .mockResolvedValueOnce({ id: 'u2', homeId: 'h1' });
    prisma.homeMember.findUnique
      .mockResolvedValueOnce({ role: 'MEMBER' })
      .mockResolvedValueOnce({ role: 'MEMBER' });

    await expect(service.delete('u1', 'u2')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows user to delete own account', async () => {
    const prisma = createPrismaMock();
    const service = new UserService(prisma as any);

    prisma.user.findUnique
      .mockResolvedValueOnce({ id: 'u1', homeId: 'h1' })
      .mockResolvedValueOnce({ id: 'u1', homeId: 'h1' });
    prisma.user.delete.mockResolvedValueOnce({ id: 'u1' });

    const result = await service.delete('u1', 'u1');

    expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 'u1' } });
    expect(result).toEqual({ message: 'Conta excluida com sucesso' });
  });
});
