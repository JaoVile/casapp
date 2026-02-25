import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { HomeRole, Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service';
import { ListAuditLogsDto } from './dtos/list-audit-logs.dto';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async list(requesterId: string, filters: ListAuditLogsDto) {
    const requester = await this.prisma.user.findUnique({
      where: { id: requesterId },
      select: {
        homeId: true,
      },
    });

    if (!requester) {
      throw new NotFoundException('Usuario nao encontrado');
    }

    if (!requester.homeId) {
      throw new ForbiddenException('Usuario nao pertence a uma casa');
    }

    const requesterMembership = await this.prisma.homeMember.findUnique({
      where: {
        homeId_userId: {
          homeId: requester.homeId,
          userId: requesterId,
        },
      },
      select: {
        role: true,
      },
    });

    if (!requesterMembership || requesterMembership.role !== HomeRole.ADMIN) {
      throw new ForbiddenException('Apenas admins podem consultar auditoria');
    }

    const page = filters.page ?? 1;
    const limit = filters.limit ?? 10;

    const where: Prisma.AuditLogWhereInput = {
      homeId: requester.homeId,
    };

    const action = filters.action?.trim();
    if (action) {
      where.action = action;
    }

    const userId = filters.userId?.trim();
    if (userId) {
      where.userId = userId;
    }

    const fromDate = filters.from ? new Date(filters.from) : null;
    const toDate = filters.to ? new Date(filters.to) : null;

    if (fromDate && toDate && fromDate > toDate) {
      throw new BadRequestException('Parametro "from" deve ser menor ou igual a "to".');
    }

    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) {
        where.createdAt.gte = fromDate;
      }
      if (toDate) {
        where.createdAt.lte = toDate;
      }
    }

    const [total, data] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          action: true,
          metadata: true,
          createdAt: true,
          userId: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
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
}
