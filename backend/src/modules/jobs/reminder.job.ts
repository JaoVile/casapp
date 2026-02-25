import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../shared/database/prisma.service';
import { RedisService } from '../../shared/redis/redis.service';

const EXPENSE_META_PREFIX = '[CASAPP_META]';

type ReminderUser = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  homeId: string | null;
  lastSeenAt: Date;
};

type ReminderDebt = {
  shareId: string;
  amount: number;
  splitPercent: number | null;
  proofUrl: string | null;
  proofDescription: string | null;
  expense: {
    id: string;
    description: string;
    totalAmount: number;
    date: Date;
    notes: string | null;
    receipt: string | null;
    splitType: string;
  };
  creditor: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    pixKey: string | null;
  };
};

@Injectable()
export class ReminderJob {
  private readonly logger = new Logger(ReminderJob.name);
  private readonly internalCronEnabled = this.parseBoolean(
    process.env.JOB_REMINDER_INTERNAL_CRON_ENABLED,
    true,
  );
  private readonly inactivityDays = this.parsePositiveInt(process.env.INACTIVITY_REMINDER_DAYS, 3);
  private readonly webhookUrl = process.env.N8N_REMINDER_WEBHOOK_URL;
  private readonly webhookToken = process.env.N8N_REMINDER_WEBHOOK_TOKEN;
  private readonly batchSize = this.parsePositiveInt(process.env.N8N_REMINDER_BATCH_SIZE, 100);
  private readonly maxConcurrency = this.parsePositiveInt(
    process.env.N8N_REMINDER_CONCURRENCY,
    5,
  );
  private readonly lockTtlMs = this.parsePositiveInt(
    process.env.JOB_REMINDER_LOCK_TTL_MS,
    5 * 60 * 1000,
  );
  private readonly lockKey = 'jobs:reminder:inactive-users:lock';

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Cron(CronExpression.EVERY_6_HOURS)
  async handleInactiveUsersReminder() {
    await this.runInactiveUsersReminder({ trigger: 'cron' });
  }

  async runInactiveUsersReminder(
    options: {
      trigger?: 'cron' | 'http';
      ignoreInternalCronGate?: boolean;
    } = {},
  ) {
    const trigger = options.trigger ?? 'http';
    const ignoreInternalCronGate = options.ignoreInternalCronGate ?? false;

    if (!ignoreInternalCronGate && !this.internalCronEnabled) {
      this.logger.log(`Reminder job skipped because internal cron is disabled (trigger=${trigger}).`);
      return;
    }

    if (!this.webhookUrl) return;
    const lockToken = `${process.pid}:${Date.now()}`;

    if (!(await this.acquireLock(lockToken))) {
      this.logger.log(
        `Reminder job skipped because another worker holds the lock (trigger=${trigger}).`,
      );
      return;
    }

    try {
      const now = new Date();
      const inactivityCutoff = new Date(
        now.getTime() - this.inactivityDays * 24 * 60 * 60 * 1000,
      );

      const users = await this.prisma.user.findMany({
        where: {
          homeId: { not: null },
          lastSeenAt: { lte: inactivityCutoff },
          OR: [
            { lastInactivityReminderAt: null },
            { lastInactivityReminderAt: { lte: inactivityCutoff } },
          ],
        },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          homeId: true,
          lastSeenAt: true,
        },
        take: this.batchSize,
        orderBy: { lastSeenAt: 'asc' },
      });

      if (!users.length) return;

      const debtsByUser = await this.getDebtsByUser(users.map((user) => user.id));

      for (let start = 0; start < users.length; start += this.maxConcurrency) {
        const chunk = users.slice(start, start + this.maxConcurrency);
        await Promise.all(
          chunk.map((user) => this.sendReminder(user, now, debtsByUser.get(user.id) ?? [])),
        );
      }
    } finally {
      await this.releaseLock(lockToken);
    }
  }

  private async getDebtsByUser(userIds: string[]) {
    if (!userIds.length) return new Map<string, ReminderDebt[]>();

    const shares = await this.prisma.expenseShare.findMany({
      where: {
        userId: { in: userIds },
        isPaid: false,
      },
      select: {
        id: true,
        userId: true,
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

    const debtsByUser = new Map<string, ReminderDebt[]>();

    for (const share of shares) {
      const debts = debtsByUser.get(share.userId) ?? [];
      debts.push({
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
          notes: this.stripExpenseMeta(share.expense.notes),
          receipt: share.expense.receipt,
          splitType: share.expense.splitType,
        },
        creditor: share.expense.paidBy,
      });
      debtsByUser.set(share.userId, debts);
    }

    return debtsByUser;
  }

  private async sendReminder(user: ReminderUser, now: Date, debts: ReminderDebt[]) {
    if (!user.homeId) return;

    try {
      const totalDebt = debts.reduce((acc, debt) => acc + debt.amount, 0);
      const daysInactive = Math.floor(
        (now.getTime() - user.lastSeenAt.getTime()) / (24 * 60 * 60 * 1000),
      );

      const payload = {
        event: 'user.inactive.debt_reminder',
        generatedAt: now.toISOString(),
        inactivityDaysThreshold: this.inactivityDays,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          lastSeenAt: user.lastSeenAt.toISOString(),
          daysInactive,
        },
        debtsSummary: {
          totalDebt: Number(totalDebt.toFixed(2)),
          pendingShares: debts.length,
        },
        debts,
      };

      const response = await fetch(this.webhookUrl as string, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.webhookToken ? { Authorization: `Bearer ${this.webhookToken}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        this.logger.warn(`Webhook n8n falhou para user=${user.id}: status=${response.status}`);
        return;
      }

      await this.prisma.user.update({
        where: { id: user.id },
        data: { lastInactivityReminderAt: now },
      });
    } catch (error) {
      const message = error instanceof Error ? error.stack ?? error.message : String(error);
      this.logger.error(`Erro ao enviar lembrete para user=${user.id}`, message);
    }
  }

  private parsePositiveInt(value: string | undefined, fallback: number) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return Math.floor(parsed);
  }

  private parseBoolean(value: string | undefined, fallback: boolean) {
    if (typeof value !== 'string') return fallback;
    const normalized = value.trim().toLowerCase();
    if (!normalized) return fallback;
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
    return fallback;
  }

  private async acquireLock(token: string) {
    try {
      const result = await this.redis.set(this.lockKey, token, { ttlMs: this.lockTtlMs, nx: true });
      return result === 'OK';
    } catch {
      // If Redis is unavailable we proceed to avoid stopping reminders in single-instance setups.
      return true;
    }
  }

  private async releaseLock(token: string) {
    try {
      const current = await this.redis.get(this.lockKey);
      if (current === token) {
        await this.redis.del(this.lockKey);
      }
    } catch {
      // ignore lock release failures
    }
  }

  private stripExpenseMeta(notes: string | null) {
    if (!notes) return notes;

    const markerIndex = notes.lastIndexOf(EXPENSE_META_PREFIX);
    if (markerIndex < 0) return notes;

    const rawMeta = notes.slice(markerIndex + EXPENSE_META_PREFIX.length).trim();
    try {
      JSON.parse(rawMeta);
      const cleaned = notes.slice(0, markerIndex).trim();
      return cleaned.length ? cleaned : null;
    } catch {
      return notes;
    }
  }
}
