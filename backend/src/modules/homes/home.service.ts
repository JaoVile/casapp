import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { HomeRole } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service';
import { AuditLogUtil } from '../../shared/utils/audit-log.util';
import { NotificationService } from '../notifications/notification.service';
import { CreateHomeDto, HomePlaceType } from './dtos/create-home.dto';
import { InviteMemberDto } from './dtos/invite-member.dto';
import { JoinHomeDto } from './dtos/join-home.dto';
import { SwitchHomeDto } from './dtos/switch-home.dto';
import { HomeInviteDeliveryService } from './services/home-invite-delivery.service';
import { UpdateHomeDto } from './dtos/update-home.dto';

@Injectable()
export class HomeService {
  constructor(
    private prisma: PrismaService,
    private readonly notificationService: NotificationService,
    private readonly homeInviteDeliveryService: HomeInviteDeliveryService,
  ) {}

  async create(userId: string, dto: CreateHomeDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException('Usuario nao encontrado');
    }

    const homeName = this.composeHomeName(dto.name, dto.placeType);

    const home = await this.prisma.$transaction(async (tx) => {
      const createdHome = await this.createHomeWithUniqueCode(tx, homeName);

      await tx.homeMember.create({
        data: {
          homeId: createdHome.id,
          userId,
          role: HomeRole.ADMIN,
        },
      });

      await tx.user.update({
        where: { id: userId },
        data: {
          homeId: createdHome.id,
          isAdmin: true,
        },
      });

      return createdHome;
    });

    const parsedHome = this.parseStoredHomeName(home.name);

    await AuditLogUtil.write(this.prisma, {
      userId,
      homeId: home.id,
      action: 'HOME_CREATED',
      metadata: {
        homeName: parsedHome.name,
        placeType: parsedHome.placeType,
        homeCode: home.inviteCode,
      },
    });

    await this.notificationService.notifyUser({
      userId,
      homeId: home.id,
      type: 'HOME_CREATED',
      title: 'Casa criada com sucesso',
      message: `Voce criou a casa "${parsedHome.name}".`,
      metadata: {
        homeId: home.id,
      },
    });

    return {
      ...home,
      name: parsedHome.name,
      placeType: parsedHome.placeType,
      inviteLink: this.buildInviteLink(home.inviteCode),
    };
  }

  async join(userId: string, dto: JoinHomeDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, homeId: true },
    });

    if (!user) {
      throw new NotFoundException('Usuario nao encontrado');
    }

    const normalizedCode = (dto.homeCode ?? dto.inviteCode ?? '').trim();
    if (!normalizedCode) {
      throw new BadRequestException('Informe o ID unico da moradia.');
    }

    const home = await this.prisma.home.findUnique({
      where: { inviteCode: normalizedCode },
      select: { id: true, name: true, inviteCode: true },
    });

    if (!home) {
      throw new NotFoundException('Casa nao encontrada ou codigo invalido');
    }

    const parsedHome = this.parseStoredHomeName(home.name);

    const existingMembership = await this.prisma.homeMember.findUnique({
      where: {
        homeId_userId: {
          homeId: home.id,
          userId,
        },
      },
      select: {
        role: true,
      },
    });

    const createdMembership = !existingMembership
      ? await this.prisma.homeMember.create({
          data: {
            homeId: home.id,
            userId,
            role: HomeRole.MEMBER,
          },
          select: {
            role: true,
          },
        })
      : null;

    const activeRole = existingMembership?.role ?? createdMembership?.role ?? HomeRole.MEMBER;

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        homeId: home.id,
        isAdmin: activeRole === HomeRole.ADMIN,
      },
    });

    if (!existingMembership) {
      await AuditLogUtil.write(this.prisma, {
        userId,
        homeId: home.id,
        action: 'HOME_JOINED',
        metadata: {
          inviteCode: home.inviteCode,
        },
      });
    } else if (user.homeId !== home.id) {
      await AuditLogUtil.write(this.prisma, {
        userId,
        homeId: home.id,
        action: 'HOME_SWITCHED',
        metadata: {
          fromHomeId: user.homeId ?? null,
          toHomeId: home.id,
        },
      });
    }

    await this.notificationService.notifyUser({
      userId,
      homeId: home.id,
      type: 'HOME_JOINED',
      title: 'Entrada em casa confirmada',
      message: `Voce entrou em "${parsedHome.name}".`,
      metadata: {
        homeId: home.id,
      },
    });

    if (!existingMembership) {
      await this.notificationService.createForHomeMembers({
        homeId: home.id,
        excludeUserIds: [userId],
        type: 'HOME_MEMBER_JOINED',
        title: 'Novo membro na casa',
        message: 'Um novo membro entrou na casa.',
        metadata: {
          joinedUserId: userId,
        },
      });
    }

    return {
      ...home,
      name: parsedHome.name,
      placeType: parsedHome.placeType,
      alreadyMember: Boolean(existingMembership),
    };
  }

  async listMyHomes(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, homeId: true },
    });

    if (!user) {
      throw new NotFoundException('Usuario nao encontrado');
    }

    const memberships = await this.prisma.homeMember.findMany({
      where: { userId },
      select: {
        role: true,
        createdAt: true,
        home: {
          select: {
            id: true,
            name: true,
            inviteCode: true,
            createdAt: true,
            _count: {
              select: {
                members: true,
              },
            },
          },
        },
      },
      orderBy: [{ createdAt: 'asc' }],
    });

    const houses = memberships
      .map((membership) => {
        const parsedHome = this.parseStoredHomeName(membership.home.name);
        return {
          homeId: membership.home.id,
          name: parsedHome.name,
          placeType: parsedHome.placeType,
          inviteCode: membership.home.inviteCode,
          inviteLink: this.buildInviteLink(membership.home.inviteCode),
          createdAt: membership.home.createdAt,
          membersCount: membership.home._count.members,
          role: membership.role,
          isActive: user.homeId === membership.home.id,
        };
      })
      .sort((a, b) => {
        if (a.isActive && !b.isActive) return -1;
        if (!a.isActive && b.isActive) return 1;
        return a.name.localeCompare(b.name, 'pt-BR');
      });

    return {
      activeHomeId: user.homeId ?? null,
      homes: houses,
    };
  }

  async switchHome(userId: string, dto: SwitchHomeDto) {
    const requestedHomeId = dto.homeId.trim();
    const [user, membership] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, homeId: true },
      }),
      this.prisma.homeMember.findUnique({
        where: {
          homeId_userId: {
            homeId: requestedHomeId,
            userId,
          },
        },
        select: {
          role: true,
          home: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
    ]);

    if (!user) {
      throw new NotFoundException('Usuario nao encontrado');
    }

    if (!membership) {
      throw new ForbiddenException('Voce nao pertence a esta casa.');
    }

    if (user.homeId === requestedHomeId) {
      const parsedHome = this.parseStoredHomeName(membership.home.name);
      return {
        activeHomeId: membership.home.id,
        activeHomeName: parsedHome.name,
        role: membership.role,
      };
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        homeId: membership.home.id,
        isAdmin: membership.role === HomeRole.ADMIN,
      },
    });

    await AuditLogUtil.write(this.prisma, {
      userId,
      homeId: membership.home.id,
      action: 'HOME_SWITCHED',
      metadata: {
        fromHomeId: user.homeId ?? null,
        toHomeId: membership.home.id,
      },
    });

    const parsedHome = this.parseStoredHomeName(membership.home.name);
    return {
      activeHomeId: membership.home.id,
      activeHomeName: parsedHome.name,
      role: membership.role,
    };
  }

  async findOneForUser(userId: string, id: string) {
    const membership = await this.prisma.homeMember.findUnique({
      where: {
        homeId_userId: {
          homeId: id,
          userId,
        },
      },
      select: {
        userId: true,
      },
    });

    if (!membership) {
      throw new ForbiddenException('Voce nao pode acessar dados de outra casa');
    }

    const home = await this.prisma.home.findUnique({
      where: { id },
      include: {
        members: {
          select: {
            role: true,
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                avatar: true,
              },
            },
          },
        },
      },
    });

    if (!home) {
      throw new NotFoundException('Casa nao encontrada');
    }

    const parsedHome = this.parseStoredHomeName(home.name);

    return {
      ...home,
      name: parsedHome.name,
      placeType: parsedHome.placeType,
      members: home.members.map((membershipItem) => ({
        ...membershipItem.user,
        role: membershipItem.role,
        isAdmin: membershipItem.role === HomeRole.ADMIN,
      })),
    };
  }

  async getMyInvite(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        homeId: true,
        home: {
          select: {
            id: true,
            name: true,
            inviteCode: true,
            _count: { select: { members: true } },
          },
        },
      },
    });

    if (!user?.homeId || !user.home) {
      throw new ForbiddenException('Voce precisa pertencer a uma casa');
    }

    const parsedHome = this.parseStoredHomeName(user.home.name);
    const inviteLink = this.buildInviteLink(user.home.inviteCode);
    return {
      homeId: user.home.id,
      homeName: parsedHome.name,
      inviteCode: user.home.inviteCode,
      inviteLink,
      membersCount: user.home._count.members,
    };
  }

  async inviteByEmail(userId: string, dto: InviteMemberDto) {
    const inviter = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        homeId: true,
        home: {
          select: {
            id: true,
            name: true,
            inviteCode: true,
            _count: { select: { members: true } },
          },
        },
      },
    });

    if (!inviter?.homeId || !inviter.home) {
      throw new ForbiddenException('Voce precisa pertencer a uma casa para convidar membros.');
    }

    const inviterMembership = await this.prisma.homeMember.findUnique({
      where: {
        homeId_userId: {
          homeId: inviter.home.id,
          userId: inviter.id,
        },
      },
      select: {
        role: true,
      },
    });

    if (!inviterMembership || inviterMembership.role !== HomeRole.ADMIN) {
      throw new ForbiddenException('Somente admin da casa pode enviar convites.');
    }

    const parsedHome = this.parseStoredHomeName(inviter.home.name);

    const targetEmail = dto.email.trim().toLowerCase();
    if (targetEmail === inviter.email.trim().toLowerCase()) {
      throw new ConflictException('Voce nao pode convidar seu proprio e-mail.');
    }

    const existingMember = await this.prisma.homeMember.findFirst({
      where: {
        homeId: inviter.home.id,
        user: {
          email: targetEmail,
        },
      },
      select: {
        userId: true,
      },
    });

    if (existingMember) {
      throw new ConflictException('Esse e-mail ja pertence a sua casa.');
    }

    const inviteLink = this.buildInviteLink(inviter.home.inviteCode, targetEmail);
    const deliveryResult = await this.homeInviteDeliveryService.sendInvite({
      invitedEmail: targetEmail,
      inviterName: inviter.name,
      homeName: parsedHome.name,
      inviteLink,
    });

    await AuditLogUtil.write(this.prisma, {
      userId: inviter.id,
      homeId: inviter.home.id,
      action: 'HOME_INVITE_SENT',
      metadata: {
        invitedEmail: targetEmail,
        delivered: deliveryResult.delivered,
      },
    });

    return {
      message: deliveryResult.delivered
        ? 'Convite enviado com sucesso.'
        : 'Convite gerado, mas envio de e-mail nao configurado no servidor.',
      delivered: deliveryResult.delivered,
      inviteLink,
      inviteCode: inviter.home.inviteCode,
      invitedEmail: targetEmail,
      membersCount: inviter.home._count.members,
    };
  }

  async leave(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { homeId: true },
    });

    if (!user?.homeId) {
      throw new ForbiddenException('Voce nao possui casa ativa para sair.');
    }

    const activeHomeId = user.homeId;

    const nextMembership = await this.prisma.$transaction(async (tx) => {
      const activeMembership = await tx.homeMember.findUnique({
        where: {
          homeId_userId: {
            homeId: activeHomeId,
            userId,
          },
        },
        select: {
          role: true,
        },
      });

      if (activeMembership) {
        await tx.homeMember.delete({
          where: {
            homeId_userId: {
              homeId: activeHomeId,
              userId,
            },
          },
        });

        if (activeMembership.role === HomeRole.ADMIN) {
          const anotherAdmin = await tx.homeMember.findFirst({
            where: {
              homeId: activeHomeId,
              role: HomeRole.ADMIN,
            },
            select: { userId: true },
          });

          if (!anotherAdmin) {
            const promoteCandidate = await tx.homeMember.findFirst({
              where: {
                homeId: activeHomeId,
              },
              orderBy: {
                createdAt: 'asc',
              },
              select: {
                homeId: true,
                userId: true,
              },
            });

            if (promoteCandidate) {
              await tx.homeMember.update({
                where: {
                  homeId_userId: {
                    homeId: promoteCandidate.homeId,
                    userId: promoteCandidate.userId,
                  },
                },
                data: {
                  role: HomeRole.ADMIN,
                },
              });
            }
          }
        }
      }

      const fallbackMembership = await tx.homeMember.findFirst({
        where: {
          userId,
        },
        orderBy: {
          createdAt: 'desc',
        },
        select: {
          homeId: true,
          role: true,
        },
      });

      await tx.user.update({
        where: { id: userId },
        data: {
          homeId: fallbackMembership?.homeId ?? null,
          isAdmin: fallbackMembership?.role === HomeRole.ADMIN,
        },
      });

      return fallbackMembership;
    });

    await AuditLogUtil.write(this.prisma, {
      userId,
      homeId: activeHomeId,
      action: 'HOME_LEFT',
      metadata: {
        leftHomeId: activeHomeId,
        nextActiveHomeId: nextMembership?.homeId ?? null,
      },
    });

    await this.notificationService.createForHomeMembers({
      homeId: activeHomeId,
      excludeUserIds: [userId],
      type: 'HOME_MEMBER_LEFT',
      title: 'Membro saiu da casa',
      message: 'Um membro saiu da casa.',
      metadata: {
        userId,
      },
    });

    return {
      message: 'Voce saiu da casa ativa com sucesso.',
      activeHomeId: nextMembership?.homeId ?? null,
    };
  }

  async update(userId: string, homeId: string, dto: UpdateHomeDto) {
    const targetHomeId = homeId.trim();
    if (!targetHomeId) {
      throw new BadRequestException('Casa invalida.');
    }

    const membership = await this.prisma.homeMember.findUnique({
      where: {
        homeId_userId: {
          homeId: targetHomeId,
          userId,
        },
      },
      select: {
        role: true,
        home: {
          select: {
            id: true,
            name: true,
            inviteCode: true,
          },
        },
      },
    });

    if (!membership) {
      throw new ForbiddenException('Voce nao pertence a esta casa.');
    }

    if (membership.role !== HomeRole.ADMIN) {
      throw new ForbiddenException('Somente admin da casa pode editar.');
    }

    const currentParsedHome = this.parseStoredHomeName(membership.home.name);
    const nextPlaceType = dto.placeType ?? currentParsedHome.placeType;
    const nextName = this.composeHomeName(dto.name, nextPlaceType);
    const updatedHome = await this.prisma.home.update({
      where: { id: targetHomeId },
      data: {
        name: nextName,
      },
      select: {
        id: true,
        name: true,
        inviteCode: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const parsedUpdatedHome = this.parseStoredHomeName(updatedHome.name);

    await AuditLogUtil.write(this.prisma, {
      userId,
      homeId: targetHomeId,
      action: 'HOME_UPDATED',
      metadata: {
        previousName: currentParsedHome.name,
        nextName: parsedUpdatedHome.name,
        placeType: parsedUpdatedHome.placeType,
      },
    });

    await this.notificationService.createForHomeMembers({
      homeId: targetHomeId,
      excludeUserIds: [userId],
      type: 'HOME_UPDATED',
      title: 'Casa atualizada',
      message: `A casa agora se chama "${parsedUpdatedHome.name}".`,
      metadata: {
        homeId: targetHomeId,
      },
    });

    return {
      ...updatedHome,
      name: parsedUpdatedHome.name,
      placeType: parsedUpdatedHome.placeType,
      inviteLink: this.buildInviteLink(updatedHome.inviteCode),
    };
  }

  async remove(userId: string, homeId: string) {
    const targetHomeId = homeId.trim();
    if (!targetHomeId) {
      throw new BadRequestException('Casa invalida.');
    }

    const membership = await this.prisma.homeMember.findUnique({
      where: {
        homeId_userId: {
          homeId: targetHomeId,
          userId,
        },
      },
      select: {
        role: true,
        home: {
          select: {
            id: true,
            name: true,
            members: {
              select: {
                userId: true,
              },
            },
          },
        },
      },
    });

    if (!membership) {
      throw new ForbiddenException('Voce nao pertence a esta casa.');
    }

    if (membership.role !== HomeRole.ADMIN) {
      throw new ForbiddenException('Somente admin da casa pode excluir.');
    }

    const deletedHomeName = this.parseStoredHomeName(membership.home.name).name;

    const affectedUserIds = await this.prisma.$transaction(async (tx) => {
      const activeUsers = await tx.user.findMany({
        where: { homeId: targetHomeId },
        select: { id: true },
      });

      const usersInHome = [
        ...membership.home.members.map((member) => member.userId),
        ...activeUsers.map((user) => user.id),
      ];

      const uniqueUserIds = Array.from(new Set(usersInHome));

      for (const memberUserId of uniqueUserIds) {
        const fallbackMembership = await tx.homeMember.findFirst({
          where: {
            userId: memberUserId,
            homeId: { not: targetHomeId },
          },
          orderBy: {
            createdAt: 'desc',
          },
          select: {
            homeId: true,
            role: true,
          },
        });

        await tx.user.update({
          where: { id: memberUserId },
          data: {
            homeId: fallbackMembership?.homeId ?? null,
            isAdmin: fallbackMembership?.role === HomeRole.ADMIN,
          },
        });
      }

      await tx.home.delete({
        where: { id: targetHomeId },
      });

      return uniqueUserIds;
    });

    await AuditLogUtil.write(this.prisma, {
      userId,
      homeId: null,
      action: 'HOME_DELETED',
      metadata: {
        deletedHomeId: targetHomeId,
        homeName: deletedHomeName,
        affectedUsers: affectedUserIds.length,
      },
    });

    const notifiedUsers = affectedUserIds.filter((targetUserId) => targetUserId !== userId);
    if (notifiedUsers.length > 0) {
      await this.notificationService.createForUsers(
        notifiedUsers.map((targetUserId) => ({
          userId: targetUserId,
          homeId: null,
          type: 'HOME_DELETED',
          title: 'Casa removida',
          message: `A casa "${deletedHomeName}" foi excluida por um administrador.`,
          metadata: {
            deletedHomeId: targetHomeId,
          },
        })),
      );
    }

    return {
      message: 'Casa excluida com sucesso.',
      deletedHomeId: targetHomeId,
      affectedUsers: affectedUserIds.length,
    };
  }

  private async createHomeWithUniqueCode(tx: any, name: string) {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const inviteCode = this.generateHomeCode();

      const existing = await tx.home.findUnique({
        where: { inviteCode },
        select: { id: true },
      });
      if (existing) continue;

      try {
        const created = await tx.home.create({
          data: {
            name,
            inviteCode,
          },
        });
        return created;
      } catch (error: any) {
        if (error?.code === 'P2002') {
          continue;
        }
        throw error;
      }
    }

    throw new ConflictException('Nao foi possivel gerar um ID unico para a moradia.');
  }

  private generateHomeCode() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = randomBytes(8);
    let code = 'CASA-';
    for (let index = 0; index < bytes.length; index += 1) {
      code += alphabet[bytes[index] % alphabet.length];
    }
    return code;
  }

  private composeHomeName(name: string, placeType?: HomePlaceType) {
    const normalizedName = name.trim();
    const placeLabel = this.getPlaceTypeLabel(placeType ?? HomePlaceType.HOUSE);
    return `${placeLabel}: ${normalizedName}`;
  }

  private parseStoredHomeName(storedName: string) {
    const normalizedStoredName = storedName.trim();

    const knownPlaceTypes: HomePlaceType[] = [
      HomePlaceType.HOUSE,
      HomePlaceType.APARTMENT,
      HomePlaceType.BUILDING,
      HomePlaceType.CONDO,
      HomePlaceType.STUDIO,
      HomePlaceType.OTHER,
    ];

    for (const placeType of knownPlaceTypes) {
      const prefix = `${this.getPlaceTypeLabel(placeType)}: `;
      if (!normalizedStoredName.startsWith(prefix)) continue;

      const extractedName = normalizedStoredName.slice(prefix.length).trim();
      return {
        name: extractedName || normalizedStoredName,
        placeType,
      };
    }

    return {
      name: normalizedStoredName,
      placeType: HomePlaceType.HOUSE,
    };
  }

  private getPlaceTypeLabel(placeType: HomePlaceType) {
    switch (placeType) {
      case HomePlaceType.APARTMENT:
        return 'Apartamento';
      case HomePlaceType.BUILDING:
        return 'Predio';
      case HomePlaceType.CONDO:
        return 'Condominio';
      case HomePlaceType.STUDIO:
        return 'Kitnet';
      case HomePlaceType.OTHER:
        return 'Moradia';
      case HomePlaceType.HOUSE:
      default:
        return 'Casa';
    }
  }

  private buildInviteLink(inviteCode: string, email?: string) {
    const baseUrl = (
      process.env.AUTH_INVITE_URL_BASE?.trim() ||
      process.env.FRONTEND_URL?.trim() ||
      'http://localhost:5173'
    ).replace(/\/$/, '');

    const params = new URLSearchParams({
      invite: inviteCode,
    });

    if (email?.trim()) {
      params.set('email', email.trim().toLowerCase());
    }

    return `${baseUrl}/register?${params.toString()}`;
  }
}
