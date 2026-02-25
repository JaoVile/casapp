import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';
import { RedisService } from '../../shared/redis/redis.service';
import { AuditLogUtil } from '../../shared/utils/audit-log.util';
import { NotificationService } from '../notifications/notification.service';
import { CreateTaskDto } from './dtos/create-task.dto';
import { TaskFiltersDto } from './dtos/task-filters.dto';
import { UpdateTaskDto } from './dtos/update-task.dto';

@Injectable()
export class TaskService {
  private readonly cacheTtlSec = this.parsePositiveInt(process.env.CACHE_TTL_SECONDS, 120);
  private readonly defaultRecurringTasks: Array<{
    title: string;
    points: number;
    frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  }> = [
    { title: 'Lavar a louca', points: 8, frequency: 'DAILY' },
    { title: 'Arrumar a cama', points: 5, frequency: 'DAILY' },
    { title: 'Tirar o lixo', points: 7, frequency: 'DAILY' },
    { title: 'Limpar a casa', points: 15, frequency: 'WEEKLY' },
    { title: 'Varrer a casa', points: 12, frequency: 'WEEKLY' },
    { title: 'Limpar a casa com mop', points: 14, frequency: 'WEEKLY' },
    { title: 'Limpar o banheiro', points: 15, frequency: 'WEEKLY' },
    { title: 'Organizar a geladeira', points: 12, frequency: 'WEEKLY' },
    { title: 'Comprar agua', points: 10, frequency: 'WEEKLY' },
    { title: 'Lavar as roupas', points: 20, frequency: 'MONTHLY' },
    { title: 'Conferir contas da casa', points: 18, frequency: 'MONTHLY' },
    { title: 'Revisar lista de compras do mes', points: 18, frequency: 'MONTHLY' },
  ];

  constructor(
    private prisma: PrismaService,
    private readonly notificationService: NotificationService,
    @Optional() private readonly redis?: RedisService,
  ) {}

  async findAll(homeId: string, filters: TaskFiltersDto = {}) {
    await this.ensureDefaultTasks(homeId);
    await this.refreshRecurringTasks(homeId);

    const { skip, take } = this.resolvePagination(filters.page, filters.limit, 20, 100);
    const where: Record<string, unknown> = { homeId };

    if (typeof filters.isDone === 'boolean') {
      where.isDone = filters.isDone;
    }

    if (filters.assignedToId) {
      where.assignedToId = filters.assignedToId;
    }

    const createdAtFilter: Record<string, Date> = {};
    if (filters.from) {
      createdAtFilter.gte = new Date(filters.from);
    }
    if (filters.to) {
      const endDate = new Date(filters.to);
      endDate.setHours(23, 59, 59, 999);
      createdAtFilter.lte = endDate;
    }
    if (Object.keys(createdAtFilter).length > 0) {
      where.createdAt = createdAtFilter;
    }

    const tasks = await this.prisma.task.findMany({
      where,
      include: {
        assignedTo: { select: { id: true, name: true, avatar: true } },
      },
      orderBy: [{ isDone: 'asc' }, { createdAt: 'desc' }],
      skip,
      take,
    });

    return tasks.map((task) => ({
      ...task,
      nextDueAt: this.calculateNextDueAt(task.frequency, task.completedAt, task.isDone),
    }));
  }

  async create(homeId: string, dto: CreateTaskDto, actorUserId?: string) {
    const task = await this.prisma.task.create({
      data: {
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        points: dto.points || 10,
        frequency: this.normalizeFrequency(dto.frequency),
        homeId,
        assignedToId: dto.assignedToId || null,
      },
    });

    await this.invalidateLeaderboardCache(homeId);
    await AuditLogUtil.write(this.prisma, {
      homeId,
      userId: actorUserId ?? null,
      action: 'TASK_CREATED',
      metadata: {
        taskId: task.id,
        title: task.title,
        frequency: task.frequency,
        assignedToId: dto.assignedToId ?? null,
      },
    });

    if (task.assignedToId && task.assignedToId !== actorUserId) {
      await this.notificationService.notifyUser({
        userId: task.assignedToId,
        homeId,
        type: 'TASK_ASSIGNED',
        title: 'Nova tarefa para voce',
        message: task.title,
        metadata: {
          taskId: task.id,
          points: task.points,
          assignedBy: actorUserId ?? null,
        },
      });
    }

    return task;
  }

  async toggleComplete(homeId: string, taskId: string, userId: string) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, homeId },
      select: {
        id: true,
        homeId: true,
        isDone: true,
        assignedToId: true,
      },
    });

    if (!task) {
      throw new NotFoundException('Tarefa nao encontrada');
    }

    const isNowDone = !task.isDone;

    const updated = await this.prisma.task.update({
      where: { id: taskId },
      data: {
        isDone: isNowDone,
        completedAt: isNowDone ? new Date() : null,
        assignedToId: isNowDone ? userId : task.assignedToId,
      },
    });

    await this.invalidateLeaderboardCache(task.homeId);
    await AuditLogUtil.write(this.prisma, {
      homeId: task.homeId,
      userId,
      action: isNowDone ? 'TASK_COMPLETED' : 'TASK_REOPENED',
      metadata: {
        taskId: task.id,
      },
    });

    if (isNowDone) {
      await this.notificationService.createForHomeMembers({
        homeId: task.homeId,
        excludeUserIds: [userId],
        type: 'TASK_COMPLETED',
        title: 'Tarefa concluida',
        message: 'Uma tarefa foi marcada como concluida.',
        metadata: {
          taskId: task.id,
          completedBy: userId,
        },
      });
    }

    return updated;
  }

  async update(homeId: string, taskId: string, dto: UpdateTaskDto, actorUserId?: string) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, homeId },
      select: {
        id: true,
        title: true,
        points: true,
        frequency: true,
      },
    });

    if (!task) {
      throw new NotFoundException('Tarefa nao encontrada');
    }

    const title = dto.title?.trim();
    const description = dto.description?.trim();

    const updatedTask = await this.prisma.task.update({
      where: { id: task.id },
      data: {
        title: title ?? undefined,
        points: dto.points ?? undefined,
        description: dto.description !== undefined ? description || null : undefined,
        frequency: dto.frequency !== undefined ? this.normalizeFrequency(dto.frequency) : undefined,
      },
    });

    await this.invalidateLeaderboardCache(homeId);
    await AuditLogUtil.write(this.prisma, {
      homeId,
      userId: actorUserId ?? null,
      action: 'TASK_UPDATED',
      metadata: {
        taskId: task.id,
        previousTitle: task.title,
        newTitle: updatedTask.title,
        previousPoints: task.points,
        newPoints: updatedTask.points,
        previousFrequency: task.frequency,
        newFrequency: updatedTask.frequency,
      },
    });

    return updatedTask;
  }

  async remove(homeId: string, taskId: string, actorUserId?: string) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, homeId },
      select: { id: true, title: true },
    });

    if (!task) {
      throw new NotFoundException('Tarefa nao encontrada');
    }

    await this.prisma.task.delete({
      where: { id: task.id },
    });

    await this.invalidateLeaderboardCache(homeId);
    await AuditLogUtil.write(this.prisma, {
      homeId,
      userId: actorUserId ?? null,
      action: 'TASK_DELETED',
      metadata: {
        taskId: task.id,
        title: task.title,
      },
    });

    return { message: 'Tarefa removida com sucesso' };
  }

  async getLeaderboard(homeId: string) {
    const cacheKey = this.leaderboardCacheKey(homeId);
    const cached = await this.readCache<Array<Record<string, unknown>>>(cacheKey);
    if (cached) return cached;

    const [users, completedByUser] = await Promise.all([
      this.prisma.homeMember.findMany({
        where: { homeId },
        select: {
          user: {
            select: {
              id: true,
              name: true,
              avatar: true,
            },
          },
        },
      }),
      this.prisma.task.groupBy({
        by: ['assignedToId'],
        where: {
          homeId,
          isDone: true,
          assignedToId: { not: null },
        },
        _sum: { points: true },
        _count: { _all: true },
      }),
    ]);

    const scoreByUser = new Map<
      string,
      {
        points: number;
        tasksCompleted: number;
      }
    >();

    for (const completed of completedByUser) {
      if (!completed.assignedToId) continue;
      scoreByUser.set(completed.assignedToId, {
        points: completed._sum.points ?? 0,
        tasksCompleted: completed._count._all,
      });
    }

    const leaderboard = users
      .map((membership) => {
        const user = membership.user;
        const score = scoreByUser.get(user.id);
        const points = score?.points ?? 0;
        const levelProgress = this.buildLevelProgress(points, score?.tasksCompleted ?? 0);
        return {
          userId: user.id,
          name: user.name,
          avatar: user.avatar,
          points: points,
          tasksCompleted: score?.tasksCompleted ?? 0,
          level: levelProgress.level,
          pointsInCurrentLevel: levelProgress.pointsInCurrentLevel,
          pointsToNextLevel: levelProgress.pointsToNextLevel,
          progressPercent: levelProgress.progressPercent,
        };
      })
      .sort((a, b) => b.points - a.points);

    await this.writeCache(cacheKey, leaderboard, this.cacheTtlSec);
    return leaderboard;
  }

  async getMyProgress(homeId: string, userId: string) {
    const aggregate = await this.prisma.task.aggregate({
      where: {
        homeId,
        assignedToId: userId,
        isDone: true,
      },
      _sum: {
        points: true,
      },
      _count: {
        _all: true,
      },
    });

    const points = aggregate._sum.points ?? 0;
    const tasksCompleted = aggregate._count._all ?? 0;
    return this.buildLevelProgress(points, tasksCompleted);
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

  private async invalidateLeaderboardCache(homeId: string) {
    if (!this.redis) return;
    try {
      await this.redis.del(this.leaderboardCacheKey(homeId));
    } catch {
      // no-op cache fallback
    }
  }

  private leaderboardCacheKey(homeId: string) {
    return `cache:tasks:leaderboard:${homeId}`;
  }

  private parsePositiveInt(value: string | undefined, fallback: number) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallback;
    }
    return Math.floor(parsed);
  }

  private buildLevelProgress(points: number, tasksCompleted: number) {
    const normalizedPoints = Math.max(0, Math.floor(points));
    const level = Math.floor(normalizedPoints / 100) + 1;
    const currentLevelStart = (level - 1) * 100;
    const nextLevelPoints = level * 100;
    const pointsInCurrentLevel = normalizedPoints - currentLevelStart;
    const pointsToNextLevel = Math.max(0, nextLevelPoints - normalizedPoints);
    const progressPercent = Number(((pointsInCurrentLevel / 100) * 100).toFixed(2));

    return {
      points: normalizedPoints,
      level,
      tasksCompleted,
      pointsInCurrentLevel,
      pointsToNextLevel,
      currentLevelStart,
      nextLevelPoints,
      progressPercent,
    };
  }

  private async ensureDefaultTasks(homeId: string) {
    const existingTasks = await this.prisma.task.findMany({
      where: { homeId },
      select: { title: true },
    });
    const existingTitles = new Set(
      existingTasks.map((task) => task.title.trim().toLowerCase()),
    );
    const missingTasks = this.defaultRecurringTasks.filter(
      (task) => !existingTitles.has(task.title.trim().toLowerCase()),
    );

    if (missingTasks.length === 0) {
      return;
    }

    await this.prisma.task.createMany({
      data: missingTasks.map((task) => ({
        homeId,
        title: task.title,
        points: task.points,
        frequency: task.frequency,
      })),
    });
  }

  private async refreshRecurringTasks(homeId: string) {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = this.getStartOfWeek(now);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    const resetResults = await Promise.all([
      this.resetRecurringTasksByFrequency(homeId, 'DAILY', startOfToday),
      this.resetRecurringTasksByFrequency(homeId, 'WEEKLY', startOfWeek),
      this.resetRecurringTasksByFrequency(homeId, 'MONTHLY', startOfMonth),
      this.resetRecurringTasksByFrequency(homeId, 'YEARLY', startOfYear),
    ]);

    const hasResets = resetResults.some((result) => result.count > 0);
    if (hasResets) {
      await this.invalidateLeaderboardCache(homeId);
    }
  }

  private async resetRecurringTasksByFrequency(
    homeId: string,
    frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY',
    resetBefore: Date,
  ) {
    return this.prisma.task.updateMany({
      where: {
        homeId,
        isDone: true,
        frequency,
        OR: [{ completedAt: null }, { completedAt: { lt: resetBefore } }],
      },
      data: {
        isDone: false,
        completedAt: null,
      },
    });
  }

  private getStartOfWeek(date: Date) {
    const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const weekDay = start.getDay();
    const diffToMonday = (weekDay + 6) % 7;
    start.setDate(start.getDate() - diffToMonday);
    return start;
  }

  private calculateNextDueAt(
    frequency: string | null,
    completedAt: Date | null,
    isDone: boolean,
  ) {
    if (!isDone || !frequency) {
      return null;
    }

    const reference = completedAt ?? new Date();

    if (frequency === 'DAILY') {
      const nextDay = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());
      nextDay.setDate(nextDay.getDate() + 1);
      return nextDay;
    }

    if (frequency === 'WEEKLY') {
      const startOfWeek = this.getStartOfWeek(reference);
      startOfWeek.setDate(startOfWeek.getDate() + 7);
      return startOfWeek;
    }

    if (frequency === 'MONTHLY') {
      return new Date(reference.getFullYear(), reference.getMonth() + 1, 1);
    }

    if (frequency === 'YEARLY') {
      return new Date(reference.getFullYear() + 1, 0, 1);
    }

    return null;
  }

  private normalizeFrequency(frequency?: string | null) {
    if (!frequency) return null;
    const normalized = frequency.trim().toUpperCase();
    if (normalized === 'DAILY') return 'DAILY';
    if (normalized === 'WEEKLY') return 'WEEKLY';
    if (normalized === 'MONTHLY') return 'MONTHLY';
    if (normalized === 'YEARLY') return 'YEARLY';
    return null;
  }
}
