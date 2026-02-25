import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { SplitType } from '@prisma/client';
import { ExpenseService } from '../expenses/expense.service';

function createExpenseContext() {
  const tx = {
    category: { findFirst: jest.fn() },
    expense: { create: jest.fn() },
    expenseShare: { createMany: jest.fn() },
  };

  const prisma = {
    user: {
      findUnique: jest.fn(),
    },
    homeMember: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    expense: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    expenseShare: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    category: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) =>
      callback(tx),
    ),
  };

  return { prisma, tx };
}

describe('ExpenseService', () => {
  it('creates expense with equal split for all house members', async () => {
    const { prisma, tx } = createExpenseContext();
    const notificationService = {
      createForHomeMembers: jest.fn(),
      notifyUser: jest.fn(),
    };
    const service = new ExpenseService(prisma as any, notificationService as any);

    prisma.user.findUnique.mockResolvedValueOnce({ homeId: 'h1' });
    prisma.homeMember.findMany.mockResolvedValueOnce([{ userId: 'u1' }, { userId: 'u2' }]);
    tx.category.findFirst.mockResolvedValueOnce({ id: 'c1' });
    tx.expense.create.mockResolvedValueOnce({ id: 'e1' });
    tx.expenseShare.createMany.mockResolvedValueOnce({ count: 2 });

    await service.create('u1', {
      description: 'Internet',
      amount: 100,
      categoryId: 'c1',
      splitType: SplitType.EQUAL,
    } as any);

    const createManyPayload = tx.expenseShare.createMany.mock.calls[0][0].data as Array<{
      userId: string;
      amount: number;
      isPaid: boolean;
    }>;
    expect(createManyPayload).toHaveLength(2);
    expect(createManyPayload.map((share) => share.amount)).toEqual([50, 50]);
    expect(createManyPayload.find((share) => share.userId === 'u1')?.isPaid).toBe(true);
  });

  it('creates expense with custom split percentages', async () => {
    const { prisma, tx } = createExpenseContext();
    const notificationService = {
      createForHomeMembers: jest.fn(),
      notifyUser: jest.fn(),
    };
    const service = new ExpenseService(prisma as any, notificationService as any);

    prisma.user.findUnique.mockResolvedValueOnce({ homeId: 'h1' });
    prisma.homeMember.findMany.mockResolvedValueOnce([
      { userId: 'u1' },
      { userId: 'u2' },
      { userId: 'u3' },
    ]);
    tx.category.findFirst.mockResolvedValueOnce({ id: 'c1' });
    tx.expense.create.mockResolvedValueOnce({ id: 'e1' });
    tx.expenseShare.createMany.mockResolvedValueOnce({ count: 2 });

    await service.create('u1', {
      description: 'Compra conjunta',
      amount: 200,
      categoryId: 'c1',
      customSplits: [
        { userId: 'u1', percent: 60 },
        { userId: 'u2', percent: 40 },
      ],
    } as any);

    const createManyPayload = tx.expenseShare.createMany.mock.calls[0][0].data as Array<{
      userId: string;
      splitPercent: number;
      amount: number;
    }>;
    expect(createManyPayload).toHaveLength(2);
    expect(createManyPayload[0]).toMatchObject({ userId: 'u1', splitPercent: 60, amount: 120 });
    expect(createManyPayload[1]).toMatchObject({ userId: 'u2', splitPercent: 40, amount: 80 });
  });

  it('creates expense as individual split for payer only', async () => {
    const { prisma, tx } = createExpenseContext();
    const notificationService = {
      createForHomeMembers: jest.fn(),
      notifyUser: jest.fn(),
    };
    const service = new ExpenseService(prisma as any, notificationService as any);

    prisma.user.findUnique.mockResolvedValueOnce({ homeId: 'h1' });
    prisma.homeMember.findMany.mockResolvedValueOnce([{ userId: 'u1' }, { userId: 'u2' }]);
    tx.category.findFirst.mockResolvedValueOnce({ id: 'c1' });
    tx.expense.create.mockResolvedValueOnce({ id: 'e1' });
    tx.expenseShare.createMany.mockResolvedValueOnce({ count: 1 });

    await service.create('u1', {
      description: 'Despesa individual',
      amount: 75,
      categoryId: 'c1',
      splitType: SplitType.INDIVIDUAL,
    } as any);

    const createManyPayload = tx.expenseShare.createMany.mock.calls[0][0].data as Array<{
      userId: string;
      amount: number;
    }>;
    expect(createManyPayload).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userId: 'u1',
          amount: 75,
        }),
      ]),
    );
    expect(createManyPayload).toHaveLength(1);
  });

  it('creates expense in single-member home without failing split rules', async () => {
    const { prisma, tx } = createExpenseContext();
    const notificationService = {
      createForHomeMembers: jest.fn(),
      notifyUser: jest.fn(),
    };
    const service = new ExpenseService(prisma as any, notificationService as any);

    prisma.user.findUnique.mockResolvedValueOnce({ homeId: 'h1' });
    prisma.homeMember.findMany.mockResolvedValueOnce([{ userId: 'u1' }]);
    tx.category.findFirst.mockResolvedValueOnce({ id: 'c1' });
    tx.expense.create.mockResolvedValueOnce({ id: 'e1' });
    tx.expenseShare.createMany.mockResolvedValueOnce({ count: 1 });

    await service.create('u1', {
      description: 'Despesa solo',
      amount: 45,
      categoryId: 'c1',
      splitType: SplitType.EQUAL,
    } as any);

    const createManyPayload = tx.expenseShare.createMany.mock.calls[0][0].data as Array<{
      userId: string;
      amount: number;
      isPaid: boolean;
    }>;
    expect(createManyPayload).toHaveLength(1);
    expect(createManyPayload[0]).toMatchObject({
      userId: 'u1',
      amount: 45,
      isPaid: true,
    });
  });

  it('throws when reminder is enabled without due date', async () => {
    const { prisma } = createExpenseContext();
    const notificationService = {
      createForHomeMembers: jest.fn(),
      notifyUser: jest.fn(),
    };
    const service = new ExpenseService(prisma as any, notificationService as any);

    prisma.user.findUnique.mockResolvedValueOnce({ homeId: 'h1' });
    prisma.homeMember.findMany.mockResolvedValueOnce([{ userId: 'u1' }, { userId: 'u2' }]);

    await expect(
      service.create('u1', {
        description: 'Conta sem vencimento',
        amount: 90,
        categoryId: 'c1',
        reminderEnabled: true,
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws when settle share belongs to another user', async () => {
    const { prisma } = createExpenseContext();
    const notificationService = {
      createForHomeMembers: jest.fn(),
      notifyUser: jest.fn(),
    };
    const service = new ExpenseService(prisma as any, notificationService as any);

    prisma.expenseShare.findUnique.mockResolvedValueOnce({
      id: 's1',
      userId: 'u2',
      isPaid: false,
      expense: { homeId: 'h1' },
    });

    await expect(service.settleShare('u1', 's1', {} as any)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('throws when share does not exist while settling', async () => {
    const { prisma } = createExpenseContext();
    const notificationService = {
      createForHomeMembers: jest.fn(),
      notifyUser: jest.fn(),
    };
    const service = new ExpenseService(prisma as any, notificationService as any);

    prisma.expenseShare.findUnique.mockResolvedValueOnce(null);

    await expect(service.settleShare('u1', 'missing', {} as any)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('updates expense status between OPEN and CLOSED', async () => {
    const { prisma } = createExpenseContext();
    const notificationService = {
      createForHomeMembers: jest.fn(),
      notifyUser: jest.fn(),
    };
    const service = new ExpenseService(prisma as any, notificationService as any);

    prisma.user.findUnique.mockResolvedValueOnce({ id: 'u1', homeId: 'h1', isAdmin: false });
    prisma.expense.findUnique.mockResolvedValueOnce({
      id: 'e1',
      description: 'Internet',
      amount: 100,
      createdAt: new Date(),
      paidById: 'u1',
      homeId: 'h1',
      notes: null,
    });
    prisma.homeMember.findFirst.mockResolvedValueOnce({ role: 'MEMBER' });
    prisma.expense.update.mockResolvedValueOnce({
      id: 'e1',
      description: 'Internet',
      amount: 100,
      createdAt: new Date(),
      paidById: 'u1',
      homeId: 'h1',
      notes: '[CASAPP_META]{"recurrenceType":"NONE","recurrenceIntervalMonths":1,"reminderDaysBefore":0,"accountStatus":"CLOSED"}',
    });

    const result = await service.updateStatus('u1', 'e1', { status: 'CLOSED' } as any);

    expect(prisma.expense.update).toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({ accountStatus: 'CLOSED' }));
  });

  it('blocks deleting expense after 24h window', async () => {
    const { prisma } = createExpenseContext();
    const notificationService = {
      createForHomeMembers: jest.fn(),
      notifyUser: jest.fn(),
    };
    const service = new ExpenseService(prisma as any, notificationService as any);

    prisma.user.findUnique.mockResolvedValueOnce({ id: 'u1', homeId: 'h1', isAdmin: false });
    prisma.expense.findUnique.mockResolvedValueOnce({
      id: 'e1',
      description: 'Aluguel',
      amount: 900,
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      paidById: 'u1',
      homeId: 'h1',
      notes: null,
    });
    prisma.homeMember.findFirst.mockResolvedValueOnce({ role: 'MEMBER' });

    await expect(service.remove('u1', 'e1')).rejects.toBeInstanceOf(BadRequestException);
  });
});
