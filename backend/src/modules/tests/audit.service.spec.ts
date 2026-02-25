import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';

function createPrismaMock() {
  return {
    user: {
      findUnique: jest.fn(),
    },
    homeMember: {
      findUnique: jest.fn(),
    },
    auditLog: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
  };
}

describe('AuditService', () => {
  it('blocks non-admin users', async () => {
    const prisma = createPrismaMock();
    const service = new AuditService(prisma as any);

    prisma.user.findUnique.mockResolvedValueOnce({
      homeId: 'h1',
    });
    prisma.homeMember.findUnique.mockResolvedValueOnce({ role: 'MEMBER' });

    await expect(service.list('u1', {} as any)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns paginated logs scoped by home', async () => {
    const prisma = createPrismaMock();
    const service = new AuditService(prisma as any);

    prisma.user.findUnique.mockResolvedValueOnce({
      homeId: 'h1',
    });
    prisma.homeMember.findUnique.mockResolvedValueOnce({ role: 'ADMIN' });
    prisma.auditLog.count.mockResolvedValueOnce(2);
    prisma.auditLog.findMany.mockResolvedValueOnce([
      {
        id: 'a1',
        action: 'EXPENSE_CREATED',
      },
      {
        id: 'a2',
        action: 'TASK_COMPLETED',
      },
    ]);

    const result = await service.list('u1', {
      page: 1,
      limit: 10,
      action: 'EXPENSE_CREATED',
    });

    expect(prisma.auditLog.count).toHaveBeenCalledWith({
      where: {
        homeId: 'h1',
        action: 'EXPENSE_CREATED',
      },
    });
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          homeId: 'h1',
          action: 'EXPENSE_CREATED',
        },
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

  it('validates date range filters', async () => {
    const prisma = createPrismaMock();
    const service = new AuditService(prisma as any);

    prisma.user.findUnique.mockResolvedValueOnce({
      homeId: 'h1',
    });
    prisma.homeMember.findUnique.mockResolvedValueOnce({ role: 'ADMIN' });

    await expect(
      service.list('u1', {
        from: '2026-02-20T00:00:00.000Z',
        to: '2026-02-01T00:00:00.000Z',
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
