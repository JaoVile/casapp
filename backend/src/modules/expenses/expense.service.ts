import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { CategoryType, HomeRole, SplitType } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service';
import { RedisService } from '../../shared/redis/redis.service';
import { AuditLogUtil } from '../../shared/utils/audit-log.util';
import { NotificationService } from '../notifications/notification.service';
import { CreateExpenseDto, ExpenseSplitShareDto } from './dtos/create-expense.dto';
import { ExpenseFiltersDto } from './dtos/expense-filters.dto';
import { SettleExpenseShareDto } from './dtos/settle-expense-share.dto';
import { UpdateExpenseStatusDto } from './dtos/update-expense-status.dto';

type RecurrenceType = 'NONE' | 'MONTHLY';

type ExpenseScheduleMeta = {
  recurrenceType: RecurrenceType;
  recurrenceIntervalMonths: number;
  reminderDaysBefore: number;
  accountStatus: 'OPEN' | 'CLOSED';
};

const DEFAULT_SCHEDULE_META: ExpenseScheduleMeta = {
  recurrenceType: 'NONE',
  recurrenceIntervalMonths: 1,
  reminderDaysBefore: 0,
  accountStatus: 'OPEN',
};

const EXPENSE_META_PREFIX = '[CASAPP_META]';

const DEFAULT_HOME_CATEGORIES: Array<{
  name: string;
  icon: string;
  color: string;
  type: CategoryType;
  isRecurring: boolean;
  recurringDay?: number;
}> = [
  {
    name: 'Aluguel/Parcela',
    icon: '🏠',
    color: '#6366F1',
    type: CategoryType.FIXED,
    isRecurring: true,
    recurringDay: 10,
  },
  {
    name: 'Internet',
    icon: '📡',
    color: '#8B5CF6',
    type: CategoryType.FIXED,
    isRecurring: true,
    recurringDay: 15,
  },
  {
    name: 'Luz',
    icon: '💡',
    color: '#F59E0B',
    type: CategoryType.VARIABLE,
    isRecurring: true,
    recurringDay: 20,
  },
  {
    name: 'Agua',
    icon: '💧',
    color: '#3B82F6',
    type: CategoryType.VARIABLE,
    isRecurring: true,
    recurringDay: 20,
  },
  {
    name: 'Gas',
    icon: '🔥',
    color: '#EF4444',
    type: CategoryType.VARIABLE,
    isRecurring: true,
    recurringDay: 25,
  },
  {
    name: 'Mercado/Feira',
    icon: '🛒',
    color: '#10B981',
    type: CategoryType.VARIABLE,
    isRecurring: false,
  },
  {
    name: 'Moveis',
    icon: '🛋️',
    color: '#78716C',
    type: CategoryType.ONETIME,
    isRecurring: false,
  },
  {
    name: 'Limpeza',
    icon: '🧹',
    color: '#06B6D4',
    type: CategoryType.VARIABLE,
    isRecurring: false,
  },
  {
    name: 'Outros',
    icon: '📦',
    color: '#64748B',
    type: CategoryType.ONETIME,
    isRecurring: false,
  },
];

@Injectable()
export class ExpenseService {
  private readonly cacheTtlSec = this.parsePositiveInt(process.env.CACHE_TTL_SECONDS, 120);
  private readonly expenseReminderWebhookUrl =
    process.env.N8N_EXPENSE_ALERT_WEBHOOK_URL || process.env.N8N_REMINDER_WEBHOOK_URL;
  private readonly expenseReminderWebhookToken =
    process.env.N8N_EXPENSE_ALERT_WEBHOOK_TOKEN || process.env.N8N_REMINDER_WEBHOOK_TOKEN;

  constructor(
    private prisma: PrismaService,
    private readonly notificationService: NotificationService,
    @Optional() private readonly redis?: RedisService,
  ) {}

  async create(userId: string, dto: CreateExpenseDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { homeId: true },
    });

    if (!user?.homeId) {
      throw new NotFoundException('Usuario nao pertence a uma casa.');
    }
    const homeId = user.homeId;

    const members = await this.prisma.homeMember.findMany({
      where: { homeId },
      select: { userId: true },
    });

    if (!members.length) {
      throw new NotFoundException('Casa vazia, impossivel dividir.');
    }

    const memberIds = new Set(members.map((member) => member.userId));
    const splitType = this.resolveSplitType(dto);
    const reminderEnabled = Boolean(dto.reminderEnabled);
    const expenseDate = dto.date ? new Date(dto.date) : new Date();
    const dueDate = dto.dueDate ? new Date(dto.dueDate) : null;

    const scheduleMeta = this.resolveScheduleMeta({
      recurrenceType: dto.recurrenceType,
      recurrenceIntervalMonths: dto.recurrenceIntervalMonths,
      reminderDaysBefore: dto.reminderDaysBefore,
      reminderEnabled,
      dueDate,
    });
    const normalizedNotes = this.composeNotesWithMeta(dto.notes, scheduleMeta);

    const sharesData = this.buildShares({
      amount: dto.amount,
      splitType,
      customSplits: dto.customSplits,
      payerId: userId,
      memberIds,
    });

    const createdExpense = await this.prisma.$transaction(async (tx) => {
      const category = await tx.category.findFirst({
        where: {
          id: dto.categoryId,
          homeId,
        },
        select: { id: true },
      });

      if (!category) {
        throw new BadRequestException('Categoria invalida para esta casa.');
      }

      const expense = await tx.expense.create({
        data: {
          description: dto.description.trim(),
          amount: dto.amount,
          date: expenseDate,
          dueDate,
          splitType,
          notes: normalizedNotes,
          receipt: dto.receipt,
          categoryId: dto.categoryId,
          homeId,
          paidById: userId,
        },
      });

      await tx.expenseShare.createMany({
        data: sharesData.map((share) => ({
          expenseId: expense.id,
          userId: share.userId,
          amount: share.amount,
          splitPercent: share.splitPercent,
          isPaid: share.userId === userId || share.isPaid,
          paidAt: share.userId === userId || share.isPaid ? new Date() : null,
        })),
      });

      await this.invalidateExpenseCache(homeId);
      return expense;
    });

    await AuditLogUtil.write(this.prisma, {
      userId,
      homeId,
      action: 'EXPENSE_CREATED',
      metadata: {
        expenseId: createdExpense.id,
        amount: dto.amount,
        splitType,
        sharesCount: sharesData.length,
        date: expenseDate.toISOString(),
        dueDate: dueDate?.toISOString() ?? null,
        reminderEnabled,
        reminderDaysBefore: scheduleMeta.reminderDaysBefore,
        recurrenceType: scheduleMeta.recurrenceType,
        recurrenceIntervalMonths: scheduleMeta.recurrenceIntervalMonths,
      },
    });

    await this.notificationService.createForHomeMembers({
      homeId,
      excludeUserIds: [userId],
      type: 'EXPENSE_CREATED',
      title: 'Nova despesa adicionada',
      message: `${dto.description.trim()} - R$ ${dto.amount.toFixed(2)}`,
      metadata: {
        expenseId: createdExpense.id,
        amount: dto.amount,
        splitType,
        date: expenseDate.toISOString(),
        dueDate: dueDate?.toISOString() ?? null,
        reminderEnabled,
        reminderDaysBefore: scheduleMeta.reminderDaysBefore,
        recurrenceType: scheduleMeta.recurrenceType,
        recurrenceIntervalMonths: scheduleMeta.recurrenceIntervalMonths,
      },
    });

    if (reminderEnabled && dueDate) {
      const reminderDate = this.calculateReminderDate(dueDate, scheduleMeta.reminderDaysBefore);
      await this.notificationService.notifyUser({
        userId,
        homeId,
        type: 'EXPENSE_REMINDER_CONFIGURED',
        title: 'Alerta de vencimento ativado',
        message: `Alerta configurado para "${dto.description.trim()}" em ${reminderDate.toLocaleDateString(
          'pt-BR',
        )} (${scheduleMeta.reminderDaysBefore} dia(s) antes do vencimento).`,
        metadata: {
          expenseId: createdExpense.id,
          dueDate: dueDate.toISOString(),
          reminderDate: reminderDate.toISOString(),
          reminderDaysBefore: scheduleMeta.reminderDaysBefore,
        },
      });

      await this.dispatchExpenseReminderWebhook({
        homeId,
        userId,
        expenseId: createdExpense.id,
        description: dto.description.trim(),
        amount: dto.amount,
        categoryId: dto.categoryId,
        date: expenseDate,
        dueDate,
        reminderDaysBefore: scheduleMeta.reminderDaysBefore,
        reminderDate,
        recurrenceType: scheduleMeta.recurrenceType,
        recurrenceIntervalMonths: scheduleMeta.recurrenceIntervalMonths,
      });
    }

    return this.withPublicScheduleMeta(createdExpense);
  }

  async findAll(userId: string, filters: ExpenseFiltersDto = {}) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { homeId: true, isAdmin: true },
    });
    if (!user?.homeId) return [];
    const membership = await this.prisma.homeMember.findFirst({
      where: {
        homeId: user.homeId,
        userId,
      },
      select: { role: true },
    });
    const { skip, take } = this.resolvePagination(filters.page, filters.limit, 20, 100);

    const where: Record<string, unknown> = { homeId: user.homeId };
    if (filters.categoryId) {
      where.categoryId = filters.categoryId;
    }

    const dateFilter: Record<string, Date> = {};
    if (filters.from) {
      dateFilter.gte = new Date(filters.from);
    }
    if (filters.to) {
      const endDate = new Date(filters.to);
      endDate.setHours(23, 59, 59, 999);
      dateFilter.lte = endDate;
    }
    if (Object.keys(dateFilter).length > 0) {
      where.date = dateFilter;
    }

    const expenses = await this.prisma.expense.findMany({
      where,
      include: {
        category: true,
        paidBy: { select: { id: true, name: true, avatar: true } },
        shares: {
          select: {
            id: true,
            userId: true,
            amount: true,
            splitPercent: true,
            isPaid: true,
            paidAt: true,
            proofUrl: true,
            proofDescription: true,
            user: {
              select: { id: true, name: true },
            },
          },
        },
      },
      orderBy: { date: 'desc' },
      skip,
      take,
    });

    return expenses.map((expense) =>
      this.toExpenseResponse(expense, {
        currentUserId: userId,
        isGlobalAdmin: user.isAdmin,
        homeRole: membership?.role ?? null,
      }),
    );
  }

  async getBalances(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { homeId: true },
    });
    if (!user?.homeId) return [];

    const cacheKey = this.expenseBalanceCacheKey(user.homeId);
    const cached = await this.readCache<Array<{ userId: string; name: string; amount: number }>>(
      cacheKey,
    );
    if (cached) return cached;

    const shares = await this.prisma.expenseShare.findMany({
      where: {
        expense: { homeId: user.homeId },
        isPaid: false,
      },
      include: {
        expense: { select: { paidById: true } },
      },
    });

    const balanceByMember: Record<string, number> = {};
    const members = await this.prisma.homeMember.findMany({
      where: { homeId: user.homeId },
      select: {
        user: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    for (const member of members) {
      balanceByMember[member.user.id] = 0;
    }

    for (const share of shares) {
      const debtor = share.userId;
      const creditor = share.expense.paidById;
      if (debtor === creditor) continue;

      balanceByMember[debtor] -= share.amount;
      balanceByMember[creditor] += share.amount;
    }

    const balancesList = members.map((member) => ({
      userId: member.user.id,
      name: member.user.name,
      amount: Number((balanceByMember[member.user.id] ?? 0).toFixed(2)),
    }));

    await this.writeCache(cacheKey, balancesList, this.cacheTtlSec);
    return balancesList;
  }

  async getMyDebts(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { homeId: true },
    });
    if (!user?.homeId) return [];

    const shares = await this.prisma.expenseShare.findMany({
      where: {
        userId,
        isPaid: false,
        expense: { homeId: user.homeId },
      },
      select: {
        id: true,
        amount: true,
        splitPercent: true,
        proofUrl: true,
        proofDescription: true,
        expense: {
          select: {
            id: true,
            description: true,
            amount: true,
            date: true,
            notes: true,
            receipt: true,
            splitType: true,
            paidBy: {
              select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                pixKey: true,
              },
            },
          },
        },
      },
      orderBy: { expense: { date: 'desc' } },
    });

    return shares.map((share) => {
      const { notes, meta } = this.extractScheduleMetaFromNotes(share.expense.notes);
      return {
        shareId: share.id,
        amount: share.amount,
        splitPercent: share.splitPercent,
        proofUrl: share.proofUrl,
        proofDescription: share.proofDescription,
        expense: {
          id: share.expense.id,
          description: share.expense.description,
          totalAmount: share.expense.amount,
          date: share.expense.date,
          notes,
          receipt: share.expense.receipt,
          splitType: share.expense.splitType,
          recurrenceType: meta.recurrenceType,
          recurrenceIntervalMonths: meta.recurrenceIntervalMonths,
          reminderDaysBefore: meta.reminderDaysBefore,
          accountStatus: meta.accountStatus,
        },
        creditor: share.expense.paidBy,
      };
    });
  }

  async settleShare(userId: string, shareId: string, dto: SettleExpenseShareDto) {
    const share = await this.prisma.expenseShare.findUnique({
      where: { id: shareId },
      select: {
        id: true,
        userId: true,
        isPaid: true,
        expense: {
          select: {
            homeId: true,
            paidById: true,
            description: true,
            amount: true,
          },
        },
      },
    });

    if (!share) {
      throw new NotFoundException('Parcela de despesa nao encontrada.');
    }

    if (share.userId !== userId) {
      throw new ForbiddenException('Voce so pode quitar parcelas em seu nome.');
    }

    if (share.isPaid) {
      return this.prisma.expenseShare.findUnique({
        where: { id: shareId },
      });
    }

    const updatedShare = await this.prisma.expenseShare.update({
      where: { id: shareId },
      data: {
        isPaid: true,
        paidAt: new Date(),
        proofUrl: dto.proofUrl,
        proofDescription: dto.proofDescription,
      },
    });

    await this.invalidateExpenseCache(share.expense.homeId);
    await AuditLogUtil.write(this.prisma, {
      userId,
      homeId: share.expense.homeId,
      action: 'EXPENSE_SHARE_SETTLED',
      metadata: {
        shareId,
      },
    });

    if (share.expense.paidById !== userId) {
      await this.notificationService.notifyUser({
        userId: share.expense.paidById,
        homeId: share.expense.homeId,
        type: 'EXPENSE_SHARE_SETTLED',
        title: 'Parcela quitada',
        message: `Uma parcela de "${share.expense.description}" foi quitada.`,
        metadata: {
          shareId,
          settledBy: userId,
          totalAmount: share.expense.amount,
        },
      });
    }

    return updatedShare;
  }

  async updateStatus(userId: string, expenseId: string, dto: UpdateExpenseStatusDto) {
    const mutationContext = await this.loadExpenseMutationContext(userId, expenseId);
    const currentPublicExpense = this.withPublicScheduleMeta(mutationContext.expense);
    const nextStatus = dto.status === 'CLOSED' ? 'CLOSED' : 'OPEN';

    if (currentPublicExpense.accountStatus === nextStatus) {
      return this.toExpenseResponse(mutationContext.expense, {
        currentUserId: userId,
        isGlobalAdmin: mutationContext.user.isAdmin,
        homeRole: mutationContext.memberRole,
      });
    }

    const normalizedNotes = this.setExpenseAccountStatusInNotes(
      mutationContext.expense.notes,
      nextStatus,
    );

    const updatedExpense = await this.prisma.expense.update({
      where: { id: expenseId },
      data: { notes: normalizedNotes },
    });

    await AuditLogUtil.write(this.prisma, {
      userId,
      homeId: mutationContext.expense.homeId,
      action: 'EXPENSE_STATUS_UPDATED',
      metadata: {
        expenseId,
        previousStatus: currentPublicExpense.accountStatus,
        nextStatus,
      },
    });

    return this.toExpenseResponse(updatedExpense, {
      currentUserId: userId,
      isGlobalAdmin: mutationContext.user.isAdmin,
      homeRole: mutationContext.memberRole,
    });
  }

  async remove(userId: string, expenseId: string) {
    const mutationContext = await this.loadExpenseMutationContext(userId, expenseId);
    const deleteWindowEndsAt = this.calculateDeleteWindowEndsAt(mutationContext.expense.createdAt);
    const now = new Date();

    if (now.getTime() > deleteWindowEndsAt.getTime()) {
      throw new BadRequestException(
        `Esta conta ja entrou no historico e nao pode mais ser excluida (limite: ${deleteWindowEndsAt.toLocaleString(
          'pt-BR',
        )}).`,
      );
    }

    await this.prisma.expense.delete({
      where: { id: expenseId },
    });

    await this.invalidateExpenseCache(mutationContext.expense.homeId);
    await AuditLogUtil.write(this.prisma, {
      userId,
      homeId: mutationContext.expense.homeId,
      action: 'EXPENSE_DELETED',
      metadata: {
        expenseId,
        amount: mutationContext.expense.amount,
        description: mutationContext.expense.description,
        deletedAt: now.toISOString(),
      },
    });

    return {
      success: true,
      expenseId,
    };
  }

  async getCategories(userId?: string) {
    if (!userId) {
      return this.prisma.category.findMany();
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { homeId: true },
    });

    if (!user?.homeId) return [];

    const cacheKey = this.expenseCategoryCacheKey(user.homeId);
    const cached = await this.readCache<Array<Record<string, unknown>>>(cacheKey);
    if (cached) return cached;

    const categories = await this.prisma.category.findMany({ where: { homeId: user.homeId } });
    let normalizedCategories = categories;

    if (!normalizedCategories.length) {
      await this.ensureDefaultCategories(user.homeId);
      normalizedCategories = await this.prisma.category.findMany({
        where: { homeId: user.homeId },
      });
    }

    await this.writeCache(cacheKey, normalizedCategories, this.cacheTtlSec);
    return normalizedCategories;
  }

  private resolveScheduleMeta(input: {
    recurrenceType?: string;
    recurrenceIntervalMonths?: number;
    reminderDaysBefore?: number;
    reminderEnabled: boolean;
    dueDate: Date | null;
  }) {
    if (input.reminderEnabled && !input.dueDate) {
      throw new BadRequestException('Ative o alerta apenas quando houver data de vencimento.');
    }

    const recurrenceType: RecurrenceType = input.recurrenceType === 'MONTHLY' ? 'MONTHLY' : 'NONE';
    if (recurrenceType !== 'NONE' && !input.dueDate) {
      throw new BadRequestException('Defina vencimento para configurar recorrencia.');
    }

    const recurrenceIntervalMonths =
      recurrenceType === 'MONTHLY'
        ? this.clampInt(input.recurrenceIntervalMonths, 1, 12, 1)
        : DEFAULT_SCHEDULE_META.recurrenceIntervalMonths;

    const reminderDaysBefore = this.clampInt(input.reminderDaysBefore, 0, 30, 0);
    if (!input.reminderEnabled && reminderDaysBefore > 0) {
      throw new BadRequestException(
        'Ative o alerta de vencimento para definir quantos dias antes deseja ser avisado.',
      );
    }

    const meta: ExpenseScheduleMeta = {
      recurrenceType,
      recurrenceIntervalMonths,
      reminderDaysBefore,
      accountStatus: DEFAULT_SCHEDULE_META.accountStatus,
    };

    return meta;
  }

  private calculateReminderDate(dueDate: Date, daysBefore: number) {
    const safeDays = this.clampInt(daysBefore, 0, 30, 0);
    const reminderDate = new Date(dueDate.getTime());
    reminderDate.setDate(reminderDate.getDate() - safeDays);
    return reminderDate;
  }

  private composeNotesWithMeta(notes: string | undefined, meta: ExpenseScheduleMeta) {
    const normalizedNotes = notes?.trim() ?? '';
    const hasNonDefaultMeta =
      meta.recurrenceType !== DEFAULT_SCHEDULE_META.recurrenceType ||
      meta.recurrenceIntervalMonths !== DEFAULT_SCHEDULE_META.recurrenceIntervalMonths ||
      meta.reminderDaysBefore !== DEFAULT_SCHEDULE_META.reminderDaysBefore ||
      meta.accountStatus !== DEFAULT_SCHEDULE_META.accountStatus;

    if (!normalizedNotes && !hasNonDefaultMeta) return undefined;
    if (!hasNonDefaultMeta) return normalizedNotes || undefined;

    const metaBlock = `${EXPENSE_META_PREFIX}${JSON.stringify(meta)}`;
    return normalizedNotes ? `${normalizedNotes}\n${metaBlock}` : metaBlock;
  }

  private extractScheduleMetaFromNotes(notes: string | null | undefined): {
    notes: string | null;
    meta: ExpenseScheduleMeta;
  } {
    if (!notes) {
      return {
        notes: null,
        meta: DEFAULT_SCHEDULE_META,
      };
    }

    const markerIndex = notes.lastIndexOf(EXPENSE_META_PREFIX);
    if (markerIndex < 0) {
      return {
        notes,
        meta: DEFAULT_SCHEDULE_META,
      };
    }

    const rawMeta = notes.slice(markerIndex + EXPENSE_META_PREFIX.length).trim();
    try {
      const parsedMeta = JSON.parse(rawMeta) as Partial<ExpenseScheduleMeta>;
      const normalizedMeta = this.normalizeScheduleMeta(parsedMeta);
      const cleanNotes = notes.slice(0, markerIndex).trim();
      return {
        notes: cleanNotes.length ? cleanNotes : null,
        meta: normalizedMeta,
      };
    } catch {
      return {
        notes,
        meta: DEFAULT_SCHEDULE_META,
      };
    }
  }

  private normalizeScheduleMeta(input: Partial<ExpenseScheduleMeta>): ExpenseScheduleMeta {
    const recurrenceType: RecurrenceType = input.recurrenceType === 'MONTHLY' ? 'MONTHLY' : 'NONE';
    const recurrenceIntervalMonths =
      recurrenceType === 'MONTHLY'
        ? this.clampInt(input.recurrenceIntervalMonths, 1, 12, 1)
        : DEFAULT_SCHEDULE_META.recurrenceIntervalMonths;
    const reminderDaysBefore = this.clampInt(input.reminderDaysBefore, 0, 30, 0);
    const accountStatus = input.accountStatus === 'CLOSED' ? 'CLOSED' : 'OPEN';

    return {
      recurrenceType,
      recurrenceIntervalMonths,
      reminderDaysBefore,
      accountStatus,
    };
  }

  private withPublicScheduleMeta<T extends { notes?: string | null }>(expense: T) {
    const { notes, meta } = this.extractScheduleMetaFromNotes(expense.notes);
    return {
      ...expense,
      notes,
      recurrenceType: meta.recurrenceType,
      recurrenceIntervalMonths: meta.recurrenceIntervalMonths,
      reminderDaysBefore: meta.reminderDaysBefore,
      accountStatus: meta.accountStatus,
    };
  }

  private setExpenseAccountStatusInNotes(
    notes: string | null | undefined,
    status: 'OPEN' | 'CLOSED',
  ) {
    const extracted = this.extractScheduleMetaFromNotes(notes);
    const nextMeta: ExpenseScheduleMeta = {
      ...extracted.meta,
      accountStatus: status,
    };
    return this.composeNotesWithMeta(extracted.notes ?? undefined, nextMeta);
  }

  private calculateDeleteWindowEndsAt(createdAt: Date) {
    const deleteWindowEndsAt = new Date(createdAt.getTime());
    deleteWindowEndsAt.setHours(deleteWindowEndsAt.getHours() + 24);
    return deleteWindowEndsAt;
  }

  private canManageExpense(params: {
    currentUserId: string;
    paidById: string;
    isGlobalAdmin: boolean;
    homeRole: HomeRole | null;
  }) {
    const { currentUserId, paidById, isGlobalAdmin, homeRole } = params;
    return paidById === currentUserId || isGlobalAdmin || homeRole === HomeRole.ADMIN;
  }

  private toExpenseResponse<T extends { notes?: string | null; paidById?: string; createdAt?: Date }>(
    expense: T,
    actor: {
      currentUserId: string;
      isGlobalAdmin: boolean;
      homeRole: HomeRole | null;
    },
  ) {
    const publicExpense = this.withPublicScheduleMeta(expense);
    const canManage =
      typeof expense.paidById === 'string'
        ? this.canManageExpense({
            currentUserId: actor.currentUserId,
            paidById: expense.paidById,
            isGlobalAdmin: actor.isGlobalAdmin,
            homeRole: actor.homeRole,
          })
        : false;

    const deleteWindowEndsAt =
      expense.createdAt instanceof Date ? this.calculateDeleteWindowEndsAt(expense.createdAt) : null;
    const canDelete =
      Boolean(canManage) &&
      deleteWindowEndsAt instanceof Date &&
      Date.now() <= deleteWindowEndsAt.getTime();

    return {
      ...publicExpense,
      canManage,
      canDelete,
      deleteWindowEndsAt: deleteWindowEndsAt?.toISOString() ?? null,
    };
  }

  private async loadExpenseMutationContext(userId: string, expenseId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        homeId: true,
        isAdmin: true,
      },
    });
    if (!user?.homeId) {
      throw new NotFoundException('Usuario nao pertence a uma casa.');
    }

    const expense = await this.prisma.expense.findUnique({
      where: { id: expenseId },
    });
    if (!expense || expense.homeId !== user.homeId) {
      throw new NotFoundException('Despesa nao encontrada.');
    }

    const member = await this.prisma.homeMember.findFirst({
      where: {
        homeId: user.homeId,
        userId,
      },
      select: { role: true },
    });

    const canManage = this.canManageExpense({
      currentUserId: userId,
      paidById: expense.paidById,
      isGlobalAdmin: user.isAdmin,
      homeRole: member?.role ?? null,
    });
    if (!canManage) {
      throw new ForbiddenException('Voce nao tem permissao para alterar esta conta.');
    }

    return {
      user,
      expense,
      memberRole: member?.role ?? null,
    };
  }

  private resolveSplitType(dto: CreateExpenseDto) {
    if (dto.customSplits?.length) return SplitType.CUSTOM;
    if (dto.splitType === SplitType.INDIVIDUAL) return SplitType.INDIVIDUAL;
    return SplitType.EQUAL;
  }

  private buildShares(params: {
    amount: number;
    splitType: SplitType;
    customSplits?: ExpenseSplitShareDto[];
    payerId: string;
    memberIds: Set<string>;
  }) {
    const { amount, splitType, customSplits, payerId, memberIds } = params;
    const shares: Array<{
      userId: string;
      amount: number;
      splitPercent: number;
      isPaid?: boolean;
    }> = [];

    if (memberIds.size < 2) {
      shares.push({
        userId: payerId,
        amount: this.roundMoney(amount),
        splitPercent: 100,
        isPaid: true,
      });
      return shares;
    }

    if (splitType === SplitType.INDIVIDUAL) {
      shares.push({
        userId: payerId,
        amount: this.roundMoney(amount),
        splitPercent: 100,
        isPaid: true,
      });
      return shares;
    }

    if (splitType === SplitType.CUSTOM) {
      const validSplits = customSplits ?? [];
      if (!validSplits.length) {
        throw new BadRequestException('Divisao customizada exige customSplits.');
      }

      const seen = new Set<string>();
      let percentTotal = 0;

      for (const split of validSplits) {
        if (seen.has(split.userId)) {
          throw new BadRequestException('customSplits contem usuario duplicado.');
        }
        if (!memberIds.has(split.userId)) {
          throw new BadRequestException('customSplits contem usuario fora da casa.');
        }
        seen.add(split.userId);
        percentTotal += split.percent;
      }

      if (Math.abs(percentTotal - 100) > 0.01) {
        throw new BadRequestException('A soma dos percentuais deve ser 100%.');
      }

      let allocated = 0;
      validSplits.forEach((split, index) => {
        const isLast = index === validSplits.length - 1;
        const splitAmount = isLast
          ? this.roundMoney(amount - allocated)
          : this.roundMoney((amount * split.percent) / 100);
        allocated += splitAmount;

        shares.push({
          userId: split.userId,
          amount: splitAmount,
          splitPercent: Number(split.percent.toFixed(2)),
        });
      });

      return shares;
    }

    const memberList = Array.from(memberIds);
    const equalPercentRaw = 100 / memberList.length;
    const equalPercentRounded = Number(equalPercentRaw.toFixed(2));
    let allocated = 0;

    memberList.forEach((memberId, index) => {
      const isLast = index === memberList.length - 1;
      const splitAmount = isLast
        ? this.roundMoney(amount - allocated)
        : this.roundMoney(amount / memberList.length);
      allocated += splitAmount;

      shares.push({
        userId: memberId,
        amount: splitAmount,
        splitPercent: isLast
          ? Number((100 - equalPercentRounded * (memberList.length - 1)).toFixed(2))
          : equalPercentRounded,
      });
    });

    return shares;
  }

  private roundMoney(value: number) {
    return Number(value.toFixed(2));
  }

  private resolvePagination(
    pageValue: number | undefined,
    limitValue: number | undefined,
    defaultLimit: number,
    maxLimit: number,
  ) {
    const page = Math.max(1, pageValue ?? 1);
    const normalizedLimit = limitValue ?? defaultLimit;
    const take = Math.min(maxLimit, Math.max(1, normalizedLimit));
    const skip = (page - 1) * take;
    return { page, take, skip };
  }

  private async readCache<T>(key: string) {
    if (!this.redis) return null;
    try {
      const raw = await this.redis.get(key);
      if (!raw) return null;
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  private async writeCache(key: string, value: unknown, ttlSec: number) {
    if (!this.redis) return;
    try {
      await this.redis.set(key, JSON.stringify(value), { ttlMs: ttlSec * 1000 });
    } catch {
      // no-op cache fallback
    }
  }

  private async invalidateExpenseCache(homeId: string) {
    if (!this.redis) return;
    try {
      await this.redis.del(
        this.expenseBalanceCacheKey(homeId),
        this.expenseCategoryCacheKey(homeId),
      );
    } catch {
      // no-op cache fallback
    }
  }

  private expenseBalanceCacheKey(homeId: string) {
    return `cache:expenses:balances:${homeId}`;
  }

  private expenseCategoryCacheKey(homeId: string) {
    return `cache:expenses:categories:${homeId}`;
  }

  private async ensureDefaultCategories(homeId: string) {
    const existing = await this.prisma.category.findMany({
      where: { homeId },
      select: { name: true },
    });
    const existingNames = new Set(existing.map((category) => category.name.toLowerCase()));
    const missing = DEFAULT_HOME_CATEGORIES.filter(
      (category) => !existingNames.has(category.name.toLowerCase()),
    );

    if (!missing.length) return;

    await this.prisma.category.createMany({
      data: missing.map((category) => ({
        homeId,
        ...category,
      })),
    });

    await this.invalidateExpenseCache(homeId);
  }

  private async dispatchExpenseReminderWebhook(input: {
    homeId: string;
    userId: string;
    expenseId: string;
    description: string;
    amount: number;
    categoryId: string;
    date: Date;
    dueDate: Date;
    reminderDaysBefore: number;
    reminderDate: Date;
    recurrenceType: RecurrenceType;
    recurrenceIntervalMonths: number;
  }) {
    if (!this.expenseReminderWebhookUrl) return;

    try {
      const payload = {
        event: 'expense.due_alert.configured',
        generatedAt: new Date().toISOString(),
        expense: {
          id: input.expenseId,
          description: input.description,
          amount: input.amount,
          categoryId: input.categoryId,
          date: input.date.toISOString(),
          dueDate: input.dueDate.toISOString(),
          reminderDaysBefore: input.reminderDaysBefore,
          reminderDate: input.reminderDate.toISOString(),
          recurrenceType: input.recurrenceType,
          recurrenceIntervalMonths: input.recurrenceIntervalMonths,
        },
        context: {
          userId: input.userId,
          homeId: input.homeId,
        },
      };

      await fetch(this.expenseReminderWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.expenseReminderWebhookToken
            ? { Authorization: `Bearer ${this.expenseReminderWebhookToken}` }
            : {}),
        },
        body: JSON.stringify(payload),
      });
    } catch {
      // Alert webhook failures should not block expense creation.
    }
  }

  private clampInt(value: unknown, min: number, max: number, fallback: number) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return fallback;
    }

    const normalized = Math.floor(value);
    if (normalized < min) return min;
    if (normalized > max) return max;
    return normalized;
  }

  private parsePositiveInt(value: string | undefined, fallback: number) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallback;
    }
    return Math.floor(parsed);
  }
}
