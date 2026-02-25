import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/database/prisma.service';

@Injectable()
export class BalanceCalculatorService {
  constructor(private prisma: PrismaService) {}

  async getHomeBalance(homeId: string) {
    // 1. Pegamos todas as divisões de despesas não pagas da casa
    const pendingShares = await this.prisma.expenseShare.findMany({
      where: {
        expense: { homeId },
        isPaid: false,
      },
      include: {
        expense: { select: { paidById: true, description: true } },
        user: { select: { id: true, name: true } },
      },
    });

    const balances = new Map<string, number>();

    pendingShares.forEach((share) => {
      const creditorId = share.expense.paidById; // Quem pagou (quem recebe)
      const debtorId = share.userId;            // Quem deve

      if (creditorId === debtorId) return; // Se eu devo a mim mesmo, ignora

      // Quem deve -> saldo diminui
      balances.set(debtorId, (balances.get(debtorId) || 0) - share.amount);
      // Quem pagou -> saldo aumenta
      balances.set(creditorId, (balances.get(creditorId) || 0) + share.amount);
    });

    return Array.from(balances.entries()).map(([userId, amount]) => ({
      userId,
      amount,
    }));
  }
}