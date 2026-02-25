import { NotificationService } from '../notifications/notification.service';

function createPrismaMock() {
  return {
    notification: {
      count: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      createMany: jest.fn(),
    },
    homeMember: {
      findMany: jest.fn(),
    },
  };
}

describe('NotificationService', () => {
  it('lists notifications with pagination metadata', async () => {
    const prisma = createPrismaMock();
    const service = new NotificationService(prisma as any);

    prisma.notification.count.mockResolvedValueOnce(2);
    prisma.notification.findMany.mockResolvedValueOnce([
      { id: 'n1' },
      { id: 'n2' },
    ]);

    const result = await service.listForUser('u1', { page: 1, limit: 10, unreadOnly: false });

    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u1' },
        skip: 0,
        take: 10,
      }),
    );
    expect(result.meta).toEqual({
      total: 2,
      page: 1,
      limit: 10,
      totalPages: 1,
    });
  });

  it('marks all as read', async () => {
    const prisma = createPrismaMock();
    const service = new NotificationService(prisma as any);

    prisma.notification.updateMany.mockResolvedValueOnce({ count: 3 });

    const result = await service.markAllRead('u1');

    expect(prisma.notification.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 'u1',
          isRead: false,
        },
      }),
    );
    expect(result.updated).toBe(3);
  });

  it('creates notifications for home members excluding requested users', async () => {
    const prisma = createPrismaMock();
    const service = new NotificationService(prisma as any);

    prisma.homeMember.findMany.mockResolvedValueOnce([{ userId: 'u2' }, { userId: 'u3' }]);
    prisma.notification.createMany.mockResolvedValueOnce({ count: 2 });

    await service.createForHomeMembers({
      homeId: 'h1',
      excludeUserIds: ['u1'],
      type: 'TASK_COMPLETED',
      title: 'Tarefa concluida',
      message: 'Uma tarefa foi concluida.',
    });

    expect(prisma.homeMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          homeId: 'h1',
        }),
      }),
    );
    expect(prisma.notification.createMany).toHaveBeenCalled();
  });
});
