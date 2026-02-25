import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { HomeRole } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { AuditLogUtil } from '@shared/utils/audit-log.util';
import { HashUtil } from '@shared/utils/hash.util';
import { UpdateUserDto } from './dtos/update-user.dto';

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

  async findAll(requesterId: string) {
    const requester = await this.prisma.user.findUnique({
      where: { id: requesterId },
      select: { homeId: true },
    });
    if (!requester) {
      throw new NotFoundException('Usuario nao encontrado');
    }

    if (!requester.homeId) {
      return this.prisma.user.findMany({
        where: { id: requesterId },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          avatar: true,
          createdAt: true,
        },
      });
    }

    const members = await this.prisma.homeMember.findMany({
      where: { homeId: requester.homeId },
      select: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            avatar: true,
            createdAt: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    return members.map((member) => member.user);
  }

  async findOne(requesterId: string, targetId: string) {
    const requester = await this.prisma.user.findUnique({
      where: { id: requesterId },
      select: { id: true, homeId: true },
    });

    if (!requester) {
      throw new NotFoundException('Usuario nao encontrado');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        avatar: true,
        pixKey: true,
        homeId: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Usuario nao encontrado');
    }

    if (requester.id !== user.id) {
      if (!requester.homeId) {
        throw new ForbiddenException('Acesso negado para usuario fora da sua casa');
      }

      const sharedMembership = await this.prisma.homeMember.findUnique({
        where: {
          homeId_userId: {
            homeId: requester.homeId,
            userId: user.id,
          },
        },
        select: {
          userId: true,
        },
      });

      if (!sharedMembership) {
        throw new ForbiddenException('Acesso negado para usuario fora da sua casa');
      }
    }

    return user;
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.findOne(id, id);

    const sanitizedName = dto.name?.trim();
    const sanitizedAvatar = dto.avatar?.trim();
    const sanitizedPixKey = dto.pixKey?.trim();
    const sanitizedEmail = dto.email?.trim().toLowerCase();
    const wantsToChangePassword = Boolean(dto.currentPassword || dto.newPassword);
    const updatedFields: string[] = [];

    if (sanitizedName && sanitizedName.length < 2) {
      throw new ConflictException('Nome invalido');
    }

    if (sanitizedEmail) {
      const existing = await this.prisma.user.findFirst({
        where: {
          email: sanitizedEmail,
          id: { not: id },
        },
        select: { id: true },
      });
      if (existing) {
        throw new ConflictException('Email ja cadastrado');
      }
    }

    if (wantsToChangePassword && (!dto.currentPassword || !dto.newPassword)) {
      throw new BadRequestException('Informe senha atual e nova senha para alterar a senha.');
    }

    let passwordHash: string | undefined;
    if (dto.currentPassword && dto.newPassword) {
      const currentUser = await this.prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          password: true,
        },
      });

      if (!currentUser) {
        throw new NotFoundException('Usuario nao encontrado');
      }

      const isCurrentPasswordValid = await HashUtil.compare(dto.currentPassword, currentUser.password);
      if (!isCurrentPasswordValid) {
        throw new UnauthorizedException('Senha atual incorreta');
      }

      passwordHash = await HashUtil.hash(dto.newPassword);
      updatedFields.push('password');
    }

    const data: {
      name?: string;
      avatar?: string;
      pixKey?: string;
      email?: string;
      password?: string;
    } = {};

    if (typeof sanitizedName !== 'undefined') {
      data.name = sanitizedName;
      updatedFields.push('name');
    }
    if (typeof sanitizedAvatar !== 'undefined') {
      data.avatar = sanitizedAvatar;
      updatedFields.push('avatar');
    }
    if (typeof sanitizedPixKey !== 'undefined') {
      data.pixKey = sanitizedPixKey;
      updatedFields.push('pixKey');
    }
    if (typeof sanitizedEmail !== 'undefined') {
      data.email = sanitizedEmail;
      updatedFields.push('email');
    }
    if (passwordHash) {
      data.password = passwordHash;
    }

    const updatedUser = await this.prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        avatar: true,
        pixKey: true,
        homeId: true,
        createdAt: true,
      },
    });

    await AuditLogUtil.write(this.prisma, {
      userId: updatedUser.id,
      homeId: updatedUser.homeId,
      action: 'USER_PROFILE_UPDATED',
      metadata: {
        updatedFields,
      },
    });

    return updatedUser;
  }

  async delete(requesterId: string, targetId: string) {
    const [requester, target] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: requesterId },
        select: { id: true, homeId: true },
      }),
      this.prisma.user.findUnique({
        where: { id: targetId },
        select: { id: true, homeId: true },
      }),
    ]);

    if (!requester || !target) {
      throw new NotFoundException('Usuario nao encontrado');
    }

    const isSelf = requester.id === target.id;

    if (isSelf) {
      await this.prisma.user.delete({ where: { id: targetId } });
      await AuditLogUtil.write(this.prisma, {
        userId: requester.id,
        homeId: requester.homeId,
        action: 'USER_ACCOUNT_DELETED_SELF',
        metadata: {
          targetUserId: targetId,
        },
      });
      return { message: 'Conta excluida com sucesso' };
    }

    if (!requester.homeId) {
      throw new ForbiddenException('Voce precisa de uma casa ativa para remover membros.');
    }

    const [requesterMembership, targetMembership] = await Promise.all([
      this.prisma.homeMember.findUnique({
        where: {
          homeId_userId: {
            homeId: requester.homeId,
            userId: requester.id,
          },
        },
        select: {
          role: true,
        },
      }),
      this.prisma.homeMember.findUnique({
        where: {
          homeId_userId: {
            homeId: requester.homeId,
            userId: target.id,
          },
        },
        select: {
          role: true,
        },
      }),
    ]);

    if (!requesterMembership || requesterMembership.role !== HomeRole.ADMIN) {
      throw new ForbiddenException('Somente admin da casa ativa pode remover outro membro');
    }

    if (!targetMembership) {
      throw new ForbiddenException('Usuario nao pertence a casa ativa');
    }

    const activeHomeId = requester.homeId;

    await this.prisma.$transaction(async (tx) => {
      await tx.homeMember.delete({
        where: {
          homeId_userId: {
            homeId: activeHomeId,
            userId: target.id,
          },
        },
      });

      if (targetMembership.role === HomeRole.ADMIN) {
        const hasAnotherAdmin = await tx.homeMember.findFirst({
          where: {
            homeId: activeHomeId,
            role: HomeRole.ADMIN,
          },
          select: {
            userId: true,
          },
        });

        if (!hasAnotherAdmin) {
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

      if (target.homeId === activeHomeId) {
        const fallbackMembership = await tx.homeMember.findFirst({
          where: {
            userId: target.id,
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
          where: { id: target.id },
          data: {
            homeId: fallbackMembership?.homeId ?? null,
            isAdmin: fallbackMembership?.role === HomeRole.ADMIN,
          },
        });
      }
    });

    await AuditLogUtil.write(this.prisma, {
      userId: requester.id,
      homeId: activeHomeId,
      action: 'USER_REMOVED_FROM_HOME',
      metadata: {
        targetUserId: target.id,
        homeId: activeHomeId,
      },
    });

    return { message: 'Membro removido da casa ativa com sucesso' };
  }
}
