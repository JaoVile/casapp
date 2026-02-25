import { Injectable } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { PrismaService } from '../../shared/database/prisma.service';
import { RedisService } from '../../shared/redis/redis.service';

type DependencyStatus = {
  status: 'up' | 'down';
  latencyMs?: number;
  error?: string;
};

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  getHealth() {
    return {
      status: 'ok',
      service: 'casapp-backend',
      timestamp: new Date().toISOString(),
      uptimeSec: Math.floor(process.uptime()),
    };
  }

  async getMetrics() {
    const timestamp = new Date().toISOString();
    const processMemory = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    const startedAt = Date.now();
    try {
      const [users, homes, expenses, tasks, shoppingItems] = await Promise.all([
        this.prisma.user.count(),
        this.prisma.home.count(),
        this.prisma.expense.count(),
        this.prisma.task.count(),
        this.prisma.shoppingItem.count(),
      ]);

      return {
        status: 'ok',
        timestamp,
        process: {
          pid: process.pid,
          nodeVersion: process.version,
          uptimeSec: Math.floor(process.uptime()),
          memory: {
            rss: processMemory.rss,
            heapTotal: processMemory.heapTotal,
            heapUsed: processMemory.heapUsed,
            external: processMemory.external,
          },
          cpu: {
            userMicros: cpuUsage.user,
            systemMicros: cpuUsage.system,
          },
        },
        database: {
          countLatencyMs: Date.now() - startedAt,
          totals: {
            users,
            homes,
            expenses,
            tasks,
            shoppingItems,
          },
        },
      };
    } catch (error) {
      const err = error as Error;
      return {
        status: 'degraded',
        timestamp,
        process: {
          pid: process.pid,
          nodeVersion: process.version,
          uptimeSec: Math.floor(process.uptime()),
          memory: {
            rss: processMemory.rss,
            heapTotal: processMemory.heapTotal,
            heapUsed: processMemory.heapUsed,
            external: processMemory.external,
          },
          cpu: {
            userMicros: cpuUsage.user,
            systemMicros: cpuUsage.system,
          },
        },
        database: {
          countLatencyMs: Date.now() - startedAt,
          error: err.message,
        },
      };
    }
  }

  async getReadiness() {
    const [postgres, redis] = await Promise.all([this.checkPostgres(), this.checkRedis()]);
    const scheduler = this.checkScheduler();

    const ready = postgres.status === 'up' && redis.status === 'up' && scheduler.status === 'up';

    return {
      status: ready ? 'ready' : 'degraded',
      timestamp: new Date().toISOString(),
      dependencies: {
        postgres,
        redis,
        scheduler,
      },
    };
  }

  private async checkPostgres(): Promise<DependencyStatus> {
    const startedAt = Date.now();

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return {
        status: 'up',
        latencyMs: Date.now() - startedAt,
      };
    } catch (error) {
      const err = error as Error;
      return {
        status: 'down',
        latencyMs: Date.now() - startedAt,
        error: err.message,
      };
    }
  }

  private async checkRedis(): Promise<DependencyStatus> {
    const startedAt = Date.now();

    try {
      const result = await this.redis.ping();
      if (result !== 'PONG') {
        return {
          status: 'down',
          latencyMs: Date.now() - startedAt,
          error: `Resposta inesperada: ${result}`,
        };
      }
      return {
        status: 'up',
        latencyMs: Date.now() - startedAt,
      };
    } catch (error) {
      const err = error as Error;
      return {
        status: 'down',
        latencyMs: Date.now() - startedAt,
        error: err.message,
      };
    }
  }

  private checkScheduler() {
    const jobs = Array.from(this.schedulerRegistry.getCronJobs().keys());
    return {
      status: 'up' as const,
      cronJobs: jobs.length,
      jobNames: jobs,
    };
  }
}
