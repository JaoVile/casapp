import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ItemStatus, Priority } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service';
import { AuditLogUtil } from '../../shared/utils/audit-log.util';
import { NotificationService } from '../notifications/notification.service';
import { AddItemDto } from './dtos/add-item.dto';
import { ShoppingFiltersDto } from './dtos/shopping-filters.dto';
import { ShoppingInsightsDto } from './dtos/shopping-insights.dto';
import { UpdateItemDto } from './dtos/update-item.dto';

type ShoppingSuggestionSeed = {
  key: string;
  name: string;
  keywords: string[];
  defaultFrequencyDays: number;
  suggestedListName: string;
  defaultQuantity: number;
};

type MonthlyShoppingSpend = {
  monthKey: string;
  monthLabel: string;
  totalSpent: number;
  purchasedItems: number;
  purchasesWithoutPrice: number;
};

type ShoppingSuggestion = {
  key: string;
  name: string;
  reason: string;
  urgencyScore: number;
  expectedFrequencyDays: number;
  daysSinceLastPurchase: number | null;
  lastPurchasedAt: string | null;
  estimatedUnitPrice: number | null;
  suggestedListName: string;
  defaultQuantity: number;
};

type ShoppingInsightsResponse = {
  generatedAt: string;
  engine: string;
  monthly: MonthlyShoppingSpend[];
  currentMonthTotal: number;
  previousMonthTotal: number;
  monthOverMonthDelta: number | null;
  recentPurchases: Array<{
    id: string;
    name: string;
    quantity: number;
    unitPrice: number | null;
    total: number;
    purchasedAt: string;
    listName: string;
  }>;
  suggestions: ShoppingSuggestion[];
};

@Injectable()
export class ShoppingService {
  private readonly defaultListNames = ['Geral', 'Cafe da manha', 'Almoco', 'Janta', 'Lanches'];
  private readonly monthLabelFormatter = new Intl.DateTimeFormat('pt-BR', {
    month: 'short',
    year: 'numeric',
  });
  private readonly suggestionSeeds: ShoppingSuggestionSeed[] = [
    {
      key: 'arroz',
      name: 'Arroz',
      keywords: ['arroz'],
      defaultFrequencyDays: 14,
      suggestedListName: 'Almoco',
      defaultQuantity: 1,
    },
    {
      key: 'macarrao',
      name: 'Macarrao',
      keywords: ['macarrao', 'massa', 'espaguete', 'penne'],
      defaultFrequencyDays: 12,
      suggestedListName: 'Janta',
      defaultQuantity: 1,
    },
    {
      key: 'carne',
      name: 'Carne',
      keywords: ['carne', 'frango', 'bife', 'patinho', 'acem'],
      defaultFrequencyDays: 7,
      suggestedListName: 'Almoco',
      defaultQuantity: 1,
    },
    {
      key: 'biscoito',
      name: 'Biscoitos',
      keywords: ['biscoito', 'bolacha', 'cookie'],
      defaultFrequencyDays: 10,
      suggestedListName: 'Lanches',
      defaultQuantity: 1,
    },
    {
      key: 'doce',
      name: 'Doces',
      keywords: ['doce', 'chocolate', 'bombom', 'brigadeiro'],
      defaultFrequencyDays: 14,
      suggestedListName: 'Lanches',
      defaultQuantity: 1,
    },
    {
      key: 'leite',
      name: 'Leite',
      keywords: ['leite'],
      defaultFrequencyDays: 7,
      suggestedListName: 'Cafe da manha',
      defaultQuantity: 1,
    },
    {
      key: 'cafe',
      name: 'Cafe',
      keywords: ['cafe', 'cafe em po'],
      defaultFrequencyDays: 12,
      suggestedListName: 'Cafe da manha',
      defaultQuantity: 1,
    },
    {
      key: 'ovo',
      name: 'Ovos',
      keywords: ['ovo', 'ovos'],
      defaultFrequencyDays: 10,
      suggestedListName: 'Cafe da manha',
      defaultQuantity: 12,
    },
  ];

  constructor(
    private prisma: PrismaService,
    private readonly notificationService: NotificationService,
  ) {}

  async getLists(homeId: string, filters: ShoppingFiltersDto = {}) {
    await this.ensureDefaultLists(homeId);

    const { skip, take } = this.resolvePagination(filters.page, filters.limit, 10, 100);
    const itemLimit = this.resolveItemLimit(filters.itemLimit, 100, 300);

    const lists = await this.prisma.shoppingList.findMany({
      where: { homeId },
      include: {
        items: {
          orderBy: { createdAt: 'desc' },
          include: { addedBy: { select: { name: true } } },
          take: itemLimit,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const sortedLists = [...lists].sort((a, b) => {
      const aIsGeneral = this.normalizeName(a.name) === 'geral';
      const bIsGeneral = this.normalizeName(b.name) === 'geral';
      if (aIsGeneral && !bIsGeneral) return -1;
      if (!aIsGeneral && bIsGeneral) return 1;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });

    return sortedLists.slice(skip, skip + take);
  }

  async getInsights(
    homeId: string,
    filters: ShoppingInsightsDto = {},
  ): Promise<ShoppingInsightsResponse> {
    await this.ensureDefaultLists(homeId);

    const monthsBack = this.clampNumber(filters.monthsBack, 1, 24, 6);
    const suggestionsLimit = this.clampNumber(filters.suggestionsLimit, 1, 30, 8);
    const recentLimit = this.clampNumber(filters.recentLimit, 1, 50, 12);
    const now = new Date();
    const monthlyStart = new Date(now.getFullYear(), now.getMonth() - (monthsBack - 1), 1, 0, 0, 0, 0);
    const suggestionHistoryStart = new Date(now);
    suggestionHistoryStart.setDate(suggestionHistoryStart.getDate() - 365);

    const [purchasedForMonthly, purchasedForSuggestions, pendingItems] = await Promise.all([
      this.prisma.shoppingItem.findMany({
        where: {
          list: { homeId },
          isPurchased: true,
          purchasedAt: {
            not: null,
            gte: monthlyStart,
          },
        },
        select: {
          id: true,
          name: true,
          quantity: true,
          currentPrice: true,
          purchasedAt: true,
          list: {
            select: {
              name: true,
            },
          },
        },
        orderBy: {
          purchasedAt: 'desc',
        },
      }),
      this.prisma.shoppingItem.findMany({
        where: {
          list: { homeId },
          isPurchased: true,
          purchasedAt: {
            not: null,
            gte: suggestionHistoryStart,
          },
        },
        select: {
          name: true,
          currentPrice: true,
          purchasedAt: true,
        },
        orderBy: {
          purchasedAt: 'desc',
        },
      }),
      this.prisma.shoppingItem.findMany({
        where: {
          list: { homeId },
          isPurchased: false,
        },
        select: {
          name: true,
        },
      }),
    ]);

    const monthly = this.buildMonthlySpendSummary(purchasedForMonthly, now, monthsBack);
    const currentMonthKey = this.getMonthKey(now);
    const previousMonthKey = this.getMonthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    const currentMonthTotal =
      monthly.find((entry) => entry.monthKey === currentMonthKey)?.totalSpent ?? 0;
    const previousMonthTotal =
      monthly.find((entry) => entry.monthKey === previousMonthKey)?.totalSpent ?? 0;
    const monthOverMonthDelta =
      previousMonthTotal > 0
        ? this.roundPrice(((currentMonthTotal - previousMonthTotal) / previousMonthTotal) * 100)
        : null;

    const recentPurchases = purchasedForMonthly.slice(0, recentLimit).map((item) => {
      const quantity = item.quantity || 1;
      const unitPrice = typeof item.currentPrice === 'number' ? this.roundPrice(item.currentPrice) : null;
      return {
        id: item.id,
        name: item.name,
        quantity,
        unitPrice,
        total: unitPrice === null ? 0 : this.roundPrice(unitPrice * quantity),
        purchasedAt: item.purchasedAt!.toISOString(),
        listName: item.list.name,
      };
    });

    const suggestions = this.buildFrequencySuggestions({
      now,
      suggestionsLimit,
      purchasedItems: purchasedForSuggestions,
      pendingItems,
    });

    return {
      generatedAt: now.toISOString(),
      engine: 'frequency-model-v1',
      monthly,
      currentMonthTotal,
      previousMonthTotal,
      monthOverMonthDelta,
      recentPurchases,
      suggestions,
    };
  }

  async addItem(userId: string, homeId: string, listId: string, dto: AddItemDto) {
    const normalizedName = (dto.name ?? '').trim();
    const normalizedDescription = dto.description?.trim();
    if (!normalizedName) {
      throw new BadRequestException('Nome do item e obrigatorio.');
    }

    const list = await this.prisma.shoppingList.findFirst({
      where: {
        id: listId,
        homeId,
      },
      select: { id: true },
    });

    if (!list) {
      throw new NotFoundException('Lista nao encontrada para a sua casa');
    }

    const resolvedPrice = await this.resolveItemPrice({
      homeId,
      itemName: normalizedName,
      currentPrice: dto.currentPrice,
      useAveragePrice: dto.useAveragePrice,
    });
    const resolvedTargetPriceMax =
      typeof dto.targetPriceMax === 'number' && Number.isFinite(dto.targetPriceMax) && dto.targetPriceMax > 0
        ? this.roundPrice(dto.targetPriceMax)
        : null;
    const shouldMarkAsRunningLow = Boolean(dto.isRunningLow);

    const item = await this.prisma.shoppingItem.create({
      data: {
        name: normalizedName,
        description: normalizedDescription || null,
        quantity: dto.quantity || 1,
        currentPrice: resolvedPrice,
        targetPriceMax: resolvedTargetPriceMax,
        status: shouldMarkAsRunningLow ? ItemStatus.WATCHING : ItemStatus.PENDING,
        priority: dto.priority ?? Priority.MEDIUM,
        alertOnPrice: dto.alertOnPrice ?? true,
        listId: list.id,
        addedById: userId,
      },
    });

    await AuditLogUtil.write(this.prisma, {
      userId,
      homeId,
      action: 'SHOPPING_ITEM_ADDED',
      metadata: {
        itemId: item.id,
        listId: list.id,
        currentPrice: resolvedPrice,
        targetPriceMax: resolvedTargetPriceMax,
        priority: dto.priority ?? Priority.MEDIUM,
        alertOnPrice: dto.alertOnPrice ?? true,
        isRunningLow: shouldMarkAsRunningLow,
        usedAveragePrice: Boolean(dto.useAveragePrice && !dto.currentPrice),
      },
    });

    await this.notificationService.createForHomeMembers({
      homeId,
      excludeUserIds: [userId],
      type: 'SHOPPING_ITEM_ADDED',
      title: 'Novo item na lista',
      message: `${normalizedName} foi adicionado na lista.`,
      metadata: {
        itemId: item.id,
        listId: list.id,
        currentPrice: resolvedPrice,
        targetPriceMax: resolvedTargetPriceMax,
        isRunningLow: shouldMarkAsRunningLow,
      },
    });

    if (shouldMarkAsRunningLow) {
      await this.notificationService.createForHomeMembers({
        homeId,
        excludeUserIds: [userId],
        type: 'SHOPPING_ITEM_LOW_STOCK',
        title: 'Item sinalizado como acabando',
        message: `${normalizedName} foi marcado como item acabando.`,
        metadata: {
          itemId: item.id,
          listId: list.id,
        },
      });
    }

    return item;
  }

  async toggleItem(userId: string, homeId: string, itemId: string) {
    const item = await this.prisma.shoppingItem.findFirst({
      where: {
        id: itemId,
        list: { homeId },
      },
      select: {
        id: true,
        isPurchased: true,
        list: { select: { homeId: true, id: true } },
      },
    });
    if (!item) throw new NotFoundException('Item nao encontrado');

    const nextPurchased = !item.isPurchased;
    const updatedItem = await this.prisma.shoppingItem.update({
      where: { id: itemId },
      data: {
        isPurchased: nextPurchased,
        purchasedAt: nextPurchased ? new Date() : null,
        purchasedById: nextPurchased ? userId : null,
      },
    });

    await AuditLogUtil.write(this.prisma, {
      userId,
      homeId,
      action: nextPurchased ? 'SHOPPING_ITEM_PURCHASED' : 'SHOPPING_ITEM_UNCHECKED',
      metadata: {
        itemId: updatedItem.id,
        listId: item.list.id,
      },
    });

    if (nextPurchased) {
      await this.notificationService.createForHomeMembers({
        homeId,
        excludeUserIds: [userId],
        type: 'SHOPPING_ITEM_PURCHASED',
        title: 'Item comprado',
        message: 'Um item da lista foi marcado como comprado.',
        metadata: {
          itemId: updatedItem.id,
          listId: item.list.id,
          purchasedById: userId,
        },
      });
    }

    return updatedItem;
  }

  async updateItem(userId: string, homeId: string, itemId: string, dto: UpdateItemDto) {
    const item = await this.prisma.shoppingItem.findFirst({
      where: {
        id: itemId,
        list: { homeId },
      },
      select: {
        id: true,
        name: true,
        quantity: true,
        currentPrice: true,
        targetPriceMax: true,
        priority: true,
        alertOnPrice: true,
        status: true,
        isPurchased: true,
        listId: true,
      },
    });

    if (!item) {
      throw new NotFoundException('Item nao encontrado');
    }

    const normalizedName = dto.name?.trim();
    if (dto.name !== undefined && !normalizedName) {
      throw new BadRequestException('Nome do item e obrigatorio.');
    }

    const resolvedName = normalizedName || item.name;
    const normalizedDescription = dto.description?.trim();

    const resolvedPrice =
      dto.currentPrice !== undefined || dto.useAveragePrice
        ? await this.resolveItemPrice({
            homeId,
            itemName: resolvedName,
            currentPrice: dto.currentPrice,
            useAveragePrice: dto.useAveragePrice,
          })
        : undefined;

    const resolvedTargetPriceMax =
      dto.targetPriceMax !== undefined
        ? this.roundPrice(dto.targetPriceMax)
        : undefined;
    const shouldMarkAsRunningLow =
      dto.isRunningLow !== undefined
        ? dto.isRunningLow
        : item.status === ItemStatus.WATCHING;

    const updatedItem = await this.prisma.shoppingItem.update({
      where: { id: itemId },
      data: {
        name: normalizedName ?? undefined,
        description: dto.description !== undefined ? normalizedDescription || null : undefined,
        quantity: dto.quantity ?? undefined,
        currentPrice: resolvedPrice,
        targetPriceMax: resolvedTargetPriceMax,
        priority: dto.priority ?? undefined,
        alertOnPrice: dto.alertOnPrice ?? undefined,
        status:
          dto.isRunningLow !== undefined && !item.isPurchased
            ? shouldMarkAsRunningLow
              ? ItemStatus.WATCHING
              : ItemStatus.PENDING
            : undefined,
      },
    });

    await AuditLogUtil.write(this.prisma, {
      userId,
      homeId,
      action: 'SHOPPING_ITEM_UPDATED',
      metadata: {
        itemId: updatedItem.id,
        listId: item.listId,
        previousName: item.name,
        newName: updatedItem.name,
        previousPrice: item.currentPrice,
        newPrice: updatedItem.currentPrice,
        previousPriority: item.priority,
        newPriority: updatedItem.priority,
        isRunningLow: shouldMarkAsRunningLow,
      },
    });

    if (dto.isRunningLow === true && item.status !== ItemStatus.WATCHING) {
      await this.notificationService.createForHomeMembers({
        homeId,
        excludeUserIds: [userId],
        type: 'SHOPPING_ITEM_LOW_STOCK',
        title: 'Item sinalizado como acabando',
        message: `${updatedItem.name} foi marcado como item acabando.`,
        metadata: {
          itemId: updatedItem.id,
          listId: item.listId,
        },
      });
    }

    return updatedItem;
  }

  async deleteItem(userId: string, homeId: string, itemId: string) {
    const item = await this.prisma.shoppingItem.findFirst({
      where: {
        id: itemId,
        list: { homeId },
      },
      select: {
        id: true,
        listId: true,
      },
    });

    if (!item) {
      throw new NotFoundException('Item nao encontrado');
    }

    await this.prisma.shoppingItem.delete({ where: { id: itemId } });
    await AuditLogUtil.write(this.prisma, {
      userId,
      homeId,
      action: 'SHOPPING_ITEM_DELETED',
      metadata: {
        itemId,
        listId: item.listId,
      },
    });

    return { message: 'Item removido com sucesso' };
  }

  private buildMonthlySpendSummary(
    purchasedItems: Array<{
      purchasedAt: Date | null;
      currentPrice: number | null;
      quantity: number;
    }>,
    now: Date,
    monthsBack: number,
  ): MonthlyShoppingSpend[] {
    const monthMap = new Map<string, MonthlyShoppingSpend>();

    for (let offset = monthsBack - 1; offset >= 0; offset -= 1) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      const monthKey = this.getMonthKey(monthDate);
      monthMap.set(monthKey, {
        monthKey,
        monthLabel: this.formatMonthLabel(monthDate),
        totalSpent: 0,
        purchasedItems: 0,
        purchasesWithoutPrice: 0,
      });
    }

    for (const item of purchasedItems) {
      if (!item.purchasedAt) {
        continue;
      }

      const monthKey = this.getMonthKey(item.purchasedAt);
      const currentMonth = monthMap.get(monthKey);
      if (!currentMonth) {
        continue;
      }

      const quantity = item.quantity || 1;
      currentMonth.purchasedItems += quantity;
      if (typeof item.currentPrice === 'number' && Number.isFinite(item.currentPrice) && item.currentPrice > 0) {
        currentMonth.totalSpent = this.roundPrice(currentMonth.totalSpent + item.currentPrice * quantity);
      } else {
        currentMonth.purchasesWithoutPrice += 1;
      }
    }

    return Array.from(monthMap.values());
  }

  private buildFrequencySuggestions(input: {
    now: Date;
    suggestionsLimit: number;
    purchasedItems: Array<{
      name: string;
      currentPrice: number | null;
      purchasedAt: Date | null;
    }>;
    pendingItems: Array<{
      name: string;
    }>;
  }): ShoppingSuggestion[] {
    const { now, suggestionsLimit, purchasedItems, pendingItems } = input;
    const rankedSuggestions: Array<ShoppingSuggestion & { rankScore: number }> = [];

    for (const seed of this.suggestionSeeds) {
      const hasPending = pendingItems.some((pendingItem) =>
        this.matchesSeedKeywords(pendingItem.name, seed.keywords),
      );
      if (hasPending) {
        continue;
      }

      const matchingPurchases = purchasedItems
        .filter((item) => item.purchasedAt && this.matchesSeedKeywords(item.name, seed.keywords))
        .sort((a, b) => b.purchasedAt!.getTime() - a.purchasedAt!.getTime());

      const estimatedUnitPrice = this.estimateAveragePrice(matchingPurchases.map((item) => item.currentPrice));
      if (!matchingPurchases.length) {
        rankedSuggestions.push({
          key: seed.key,
          name: seed.name,
          reason: 'Sem historico recente. Item essencial para reposicao preventiva.',
          urgencyScore: 0.86,
          expectedFrequencyDays: seed.defaultFrequencyDays,
          daysSinceLastPurchase: null,
          lastPurchasedAt: null,
          estimatedUnitPrice,
          suggestedListName: seed.suggestedListName,
          defaultQuantity: seed.defaultQuantity,
          rankScore: 0.86,
        });
        continue;
      }

      const lastPurchaseDate = matchingPurchases[0].purchasedAt!;
      const daysSinceLastPurchase = this.daysBetween(lastPurchaseDate, now);
      const averageFrequency = this.estimateAverageFrequencyDays(
        matchingPurchases
          .map((item) => item.purchasedAt)
          .filter((value): value is Date => Boolean(value)),
        seed.defaultFrequencyDays,
      );
      const expectedFrequencyDays = this.clampNumber(averageFrequency, 3, 60, seed.defaultFrequencyDays);
      const urgencyScoreRaw = daysSinceLastPurchase / expectedFrequencyDays;

      if (urgencyScoreRaw < 0.85) {
        continue;
      }

      const urgencyScore = this.roundPrice(urgencyScoreRaw);
      const reason =
        urgencyScoreRaw >= 1.2
          ? `Ultima compra ha ${daysSinceLastPurchase} dias (media de ${expectedFrequencyDays} dias).`
          : `Reposicao proxima: ${daysSinceLastPurchase} dias desde a ultima compra.`;

      rankedSuggestions.push({
        key: seed.key,
        name: seed.name,
        reason,
        urgencyScore,
        expectedFrequencyDays,
        daysSinceLastPurchase,
        lastPurchasedAt: lastPurchaseDate.toISOString(),
        estimatedUnitPrice,
        suggestedListName: seed.suggestedListName,
        defaultQuantity: seed.defaultQuantity,
        rankScore: urgencyScore,
      });
    }

    return rankedSuggestions
      .sort((a, b) => b.rankScore - a.rankScore)
      .slice(0, suggestionsLimit)
      .map(({ rankScore, ...suggestion }) => suggestion);
  }

  private getMonthKey(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }

  private formatMonthLabel(date: Date) {
    return this.monthLabelFormatter.format(date).replace('.', '');
  }

  private daysBetween(from: Date, to: Date) {
    const diffMs = to.getTime() - from.getTime();
    return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  }

  private estimateAverageFrequencyDays(purchaseDates: Date[], fallbackValue: number) {
    if (purchaseDates.length < 2) {
      return fallbackValue;
    }

    let totalInterval = 0;
    let validIntervals = 0;

    for (let index = 0; index < purchaseDates.length - 1; index += 1) {
      const currentDate = purchaseDates[index];
      const previousDate = purchaseDates[index + 1];
      const interval = this.daysBetween(previousDate, currentDate);
      if (interval <= 0) {
        continue;
      }
      totalInterval += interval;
      validIntervals += 1;
    }

    if (!validIntervals) {
      return fallbackValue;
    }

    return Math.round(totalInterval / validIntervals);
  }

  private estimateAveragePrice(prices: Array<number | null>) {
    const validPrices = prices.filter(
      (price): price is number => typeof price === 'number' && Number.isFinite(price) && price > 0,
    );

    if (!validPrices.length) {
      return null;
    }

    const total = validPrices.reduce((sum, price) => sum + price, 0);
    return this.roundPrice(total / validPrices.length);
  }

  private matchesSeedKeywords(itemName: string, keywords: string[]) {
    const normalizedItemName = this.normalizeName(itemName);
    return keywords.some((keyword) => normalizedItemName.includes(this.normalizeName(keyword)));
  }

  private clampNumber(
    value: number | undefined,
    min: number,
    max: number,
    defaultValue: number,
  ) {
    const normalized = value ?? defaultValue;
    return Math.min(max, Math.max(min, normalized));
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

  private resolveItemLimit(
    itemLimitValue: number | undefined,
    defaultLimit: number,
    maxLimit: number,
  ) {
    const normalizedLimit = itemLimitValue ?? defaultLimit;
    return Math.min(maxLimit, Math.max(1, normalizedLimit));
  }

  private async resolveItemPrice(input: {
    homeId: string;
    itemName: string;
    currentPrice?: number;
    useAveragePrice?: boolean;
  }) {
    const { homeId, itemName, currentPrice, useAveragePrice } = input;

    if (typeof currentPrice === 'number' && Number.isFinite(currentPrice) && currentPrice > 0) {
      return this.roundPrice(currentPrice);
    }

    if (!useAveragePrice) {
      return null;
    }

    const sameItemAverage = await this.prisma.shoppingItem.aggregate({
      where: {
        list: { homeId },
        name: { equals: itemName, mode: 'insensitive' },
        currentPrice: { not: null },
      },
      _avg: { currentPrice: true },
    });

    const globalAverage = await this.prisma.shoppingItem.aggregate({
      where: {
        list: { homeId },
        currentPrice: { not: null },
      },
      _avg: { currentPrice: true },
    });

    const averageValue = sameItemAverage._avg.currentPrice ?? globalAverage._avg.currentPrice ?? null;
    return averageValue !== null ? this.roundPrice(averageValue) : null;
  }

  private roundPrice(value: number) {
    return Number(value.toFixed(2));
  }

  private normalizeName(value: string) {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();
  }

  private async ensureDefaultLists(homeId: string) {
    const existingLists = await this.prisma.shoppingList.findMany({
      where: { homeId },
      select: { name: true },
    });

    const existingNames = new Set(existingLists.map((list) => this.normalizeName(list.name)));
    const missingNames = this.defaultListNames.filter(
      (name) => !existingNames.has(this.normalizeName(name)),
    );

    if (!missingNames.length) {
      return;
    }

    await this.prisma.shoppingList.createMany({
      data: missingNames.map((name) => ({
        name,
        homeId,
      })),
    });
  }
}
