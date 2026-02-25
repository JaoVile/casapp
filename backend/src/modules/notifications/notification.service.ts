import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Notification } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service';
import { NotificationListQueryDto } from './dtos/notification.dto';

type CreateNotificationInput = {
  userId: string;
  homeId?: string | null;
  type: string;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
};

@Injectable()
export class NotificationService {
  constructor(private readonly prisma: PrismaService) {}

  async listForUser(userId: string, query: NotificationListQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const unreadOnly = query.unreadOnly ?? false;

    const where: Prisma.NotificationWhereInput = {
      userId,
      ...(unreadOnly ? { isRead: false } : {}),
    };

    const [total, data] = await Promise.all([
      this.prisma.notification.count({ where }),
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: total > 0 ? Math.ceil(total / limit) : 0,
      },
    };
  }

  async getUnreadCount(userId: string) {
    const count = await this.prisma.notification.count({
      where: {
        userId,
        isRead: false,
      },
    });
    return { count };
  }

  async markRead(userId: string, notificationId: string) {
    const notification = await this.prisma.notification.findFirst({
      where: {
        id: notificationId,
        userId,
      },
      select: {
        id: true,
        isRead: true,
      },
    });

    if (!notification) {
      throw new NotFoundException('Notificacao nao encontrada');
    }

    if (notification.isRead) {
      return this.prisma.notification.findUnique({
        where: { id: notificationId },
      });
    }

    return this.prisma.notification.update({
      where: { id: notificationId },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });
  }

  async markAllRead(userId: string) {
    const now = new Date();
    const result = await this.prisma.notification.updateMany({
      where: {
        userId,
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: now,
      },
    });

    return {
      updated: result.count,
      readAt: now.toISOString(),
    };
  }

  async createForUsers(inputs: CreateNotificationInput[]) {
    const normalized = inputs
      .map((input) => ({
        userId: input.userId,
        homeId: input.homeId ?? null,
        type: input.type.trim().toUpperCase(),
        title: input.title.trim(),
        message: input.message.trim(),
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
      }))
      .filter((input) => input.userId && input.type && input.title && input.message);

    if (!normalized.length) return;

    try {
      await this.prisma.notification.createMany({
        data: normalized,
      });
    } catch {
      // Notifications cannot block business operations.
    }
  }

  async createForHomeMembers(input: {
    homeId: string;
    excludeUserIds?: string[];
    type: string;
    title: string;
    message: string;
    metadata?: Record<string, unknown>;
  }) {
    const members = await this.prisma.homeMember.findMany({
      where: {
        homeId: input.homeId,
        ...(input.excludeUserIds?.length
          ? {
              userId: {
                notIn: input.excludeUserIds,
              },
            }
          : {}),
      },
      select: {
        userId: true,
      },
    });

    if (!members.length) return;

    await this.createForUsers(
      members.map((member) => ({
        userId: member.userId,
        homeId: input.homeId,
        type: input.type,
        title: input.title,
        message: input.message,
        metadata: input.metadata,
      })),
    );
  }

  async notifyUser(input: CreateNotificationInput) {
    await this.createForUsers([input]);
  }
}
