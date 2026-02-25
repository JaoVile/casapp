import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { HomeService } from '../homes/home.service';

function createPrismaMock() {
  return {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    home: {
      create: jest.fn(),
      findUnique: jest.fn(),
    },
    homeMember: {
      create: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };
}

describe('HomeService', () => {
  it('creates home and returns normalized payload', async () => {
    const prisma = createPrismaMock();
    const notificationService = {
      notifyUser: jest.fn(),
      createForHomeMembers: jest.fn(),
    };
    const inviteDeliveryService = {
      sendInvite: jest.fn(),
    };
    const service = new HomeService(
      prisma as any,
      notificationService as any,
      inviteDeliveryService as any,
    );

    const tx = {
      home: {
        findUnique: jest.fn().mockResolvedValueOnce(null),
        create: jest.fn().mockResolvedValueOnce({
          id: 'h1',
          name: 'Casa: Casa Nova',
          inviteCode: 'CASA-ABC12345',
          createdAt: new Date('2026-02-24T12:00:00.000Z'),
          updatedAt: new Date('2026-02-24T12:00:00.000Z'),
        }),
      },
      homeMember: {
        create: jest.fn().mockResolvedValueOnce(undefined),
      },
      user: {
        update: jest.fn().mockResolvedValueOnce(undefined),
      },
    };

    prisma.user.findUnique.mockResolvedValueOnce({ id: 'u1' });
    prisma.$transaction.mockImplementationOnce(async (callback: (client: unknown) => unknown) =>
      callback(tx),
    );

    const result = await service.create('u1', { name: 'Casa Nova' });

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(tx.home.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Casa: Casa Nova',
        }),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: 'h1',
        name: 'Casa Nova',
        placeType: 'HOUSE',
        inviteCode: 'CASA-ABC12345',
      }),
    );
    expect(String(result.inviteLink)).toContain('/register?invite=CASA-ABC12345');
    expect(notificationService.notifyUser).toHaveBeenCalled();
  });

  it('throws not found when user does not exist', async () => {
    const prisma = createPrismaMock();
    const service = new HomeService(
      prisma as any,
      { notifyUser: jest.fn(), createForHomeMembers: jest.fn() } as any,
      { sendInvite: jest.fn() } as any,
    );

    prisma.user.findUnique.mockResolvedValueOnce(null);

    await expect(service.create('u1', { name: 'Outra Casa' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('throws not found when invite code is invalid', async () => {
    const prisma = createPrismaMock();
    const service = new HomeService(
      prisma as any,
      { notifyUser: jest.fn(), createForHomeMembers: jest.fn() } as any,
      { sendInvite: jest.fn() } as any,
    );

    prisma.user.findUnique.mockResolvedValueOnce({ id: 'u1', homeId: null });
    prisma.home.findUnique.mockResolvedValueOnce(null);

    await expect(service.join('u1', { inviteCode: 'invalid' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('blocks leave when user has no active home', async () => {
    const prisma = createPrismaMock();
    const service = new HomeService(
      prisma as any,
      { notifyUser: jest.fn(), createForHomeMembers: jest.fn() } as any,
      { sendInvite: jest.fn() } as any,
    );

    prisma.user.findUnique.mockResolvedValueOnce({ homeId: null });

    await expect(service.leave('u1')).rejects.toBeInstanceOf(ForbiddenException);
  });
});
