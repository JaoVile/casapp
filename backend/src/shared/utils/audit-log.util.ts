import { Prisma, type PrismaClient } from '@prisma/client';

type AuditLogInput = {
  userId?: string | null;
  homeId?: string | null;
  action: string;
  metadata?: Record<string, unknown>;
};

export class AuditLogUtil {
  static async write(prisma: PrismaClient, input: AuditLogInput) {
    try {
      await prisma.auditLog.create({
        data: {
          action: input.action,
          userId: input.userId ?? null,
          homeId: input.homeId ?? null,
          metadata: input.metadata as Prisma.InputJsonValue | undefined,
        },
      });
    } catch {
      // Audit logging must never break business flows.
    }
  }
}
