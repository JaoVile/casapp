import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import { HomeRole } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service';
import { AuditLogUtil } from '../../shared/utils/audit-log.util';
import { HashUtil } from '../../shared/utils/hash.util';
import { looksLikeEmail, normalizePhoneNumber } from '../../shared/utils/phone.util';
import { JwtPayload } from '../../core/types/common.types';
import { PasswordResetDeliveryService } from './services/password-reset-delivery.service';
import { RegisterDto } from './dtos/register.dto';

type PublicUser = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  homeId: string | null;
  createdAt?: Date;
};

type SessionContext = {
  ipAddress?: string | null;
  userAgent?: string | null;
};

type VerifiedRefreshPayload = JwtPayload & {
  sub: string;
  email: string;
  sid: string;
  typ: 'refresh';
};

type RefreshSessionWithUser = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedBySessionId: string | null;
  user: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    homeId: string | null;
  } | null;
};

@Injectable()
export class AuthService {
  private readonly refreshExpiresIn = process.env.JWT_REFRESH_EXPIRES_IN?.trim() || '30d';
  private readonly refreshSecret = process.env.JWT_REFRESH_SECRET?.trim() || undefined;

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private passwordResetDeliveryService: PasswordResetDeliveryService,
  ) {}

  async register(dto: RegisterDto, sessionContext?: SessionContext) {
    const email = dto.email.trim().toLowerCase();
    const phone = dto.phone ? normalizePhoneNumber(dto.phone) : null;
    const inviteCode = dto.inviteCode?.trim();
    const uniqueFilters = phone ? [{ email }, { phone }] : [{ email }];

    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: uniqueFilters,
      },
      select: { id: true, email: true, phone: true },
    });

    if (existingUser) {
      if (existingUser.email === email) {
        throw new ConflictException('Email ja cadastrado');
      }
      if (phone && existingUser.phone === phone) {
        throw new ConflictException('Telefone ja cadastrado');
      }
      throw new ConflictException('Usuario ja cadastrado');
    }

    const hashedPassword = await HashUtil.hash(dto.password);
    const invitedHome = inviteCode
      ? await this.prisma.home.findUnique({
          where: { inviteCode },
          select: { id: true, name: true, inviteCode: true },
        })
      : null;

    if (inviteCode && !invitedHome) {
      throw new NotFoundException('Convite invalido ou expirado.');
    }

    const user = await this.prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          name: dto.name.trim(),
          email,
          phone,
          password: hashedPassword,
          isAdmin: false,
          ...(inviteCode
            ? {
                home: {
                  connect: { id: invitedHome!.id },
                },
              }
            : {}),
        },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          homeId: true,
          createdAt: true,
        },
      });

      if (inviteCode && createdUser.homeId) {
        await tx.homeMember.create({
          data: {
            homeId: createdUser.homeId,
            userId: createdUser.id,
            role: HomeRole.MEMBER,
          },
        });
      }

      return createdUser;
    });

    const tokens = await this.issueSessionTokens(user, sessionContext);
    await AuditLogUtil.write(this.prisma, {
      userId: user.id,
      homeId: user.homeId,
      action: 'USER_REGISTERED',
      metadata: {
        email: user.email,
        registrationMode: inviteCode ? 'invite' : 'no_home',
      },
    });

    if (inviteCode && invitedHome) {
      await AuditLogUtil.write(this.prisma, {
        userId: user.id,
        homeId: user.homeId,
        action: 'HOME_JOINED',
        metadata: {
          inviteCode: invitedHome.inviteCode,
          homeName: invitedHome.name,
        },
      });
    }

    return {
      user,
      ...tokens,
    };
  }

  async validateUser(identifier: string, password: string) {
    const normalizedIdentifier = identifier.trim();
    if (!normalizedIdentifier) {
      throw new BadRequestException('Informe e-mail ou telefone');
    }

    const where = looksLikeEmail(normalizedIdentifier)
      ? { email: normalizedIdentifier.toLowerCase() }
      : { phone: normalizePhoneNumber(normalizedIdentifier) };

    const user = await this.prisma.user.findFirst({ where });

    if (!user) throw new UnauthorizedException('Credenciais invalidas');

    const isPasswordValid = await HashUtil.compare(password, user.password);
    if (!isPasswordValid) throw new UnauthorizedException('Credenciais invalidas');

    const { password: _, ...result } = user;
    return result;
  }

  async login(user: PublicUser, sessionContext?: SessionContext) {
    await this.touchActivity(user.id);
    const tokens = await this.issueSessionTokens(user, sessionContext);
    await AuditLogUtil.write(this.prisma, {
      userId: user.id,
      homeId: user.homeId,
      action: 'USER_LOGGED_IN',
    });

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        homeId: user.homeId,
      },
      ...tokens,
    };
  }

  async getProfile(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        avatar: true,
        pixKey: true,
        homeId: true,
        home: {
          select: {
            id: true,
            name: true,
            inviteCode: true,
            _count: { select: { members: true } },
          },
        },
        homeMemberships: {
          select: {
            role: true,
            home: {
              select: {
                id: true,
                name: true,
                inviteCode: true,
                _count: {
                  select: {
                    members: true,
                  },
                },
              },
            },
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
        createdAt: true,
      },
    });
  }

  async refreshToken(refreshToken: string, sessionContext?: SessionContext) {
    const payload = this.verifyRefreshToken(refreshToken);
    const now = new Date();

    const session = await this.getRefreshSessionWithUser(payload.sid);

    if (!session || !session.user) {
      throw new UnauthorizedException('Refresh token invalido ou expirado.');
    }
    const sessionUser = session.user;

    if (session.userId !== payload.sub) {
      throw new UnauthorizedException('Refresh token invalido ou expirado.');
    }

    const incomingTokenHash = this.hashRefreshToken(refreshToken);
    if (session.tokenHash !== incomingTokenHash) {
      await this.handleRefreshTokenReuse(session, 'refresh hash mismatch', payload.sid);
      throw new UnauthorizedException('Refresh token invalido ou expirado.');
    }

    if (session.revokedAt) {
      await this.handleRefreshTokenReuse(session, 'refresh token reused after revoke', payload.sid);
      throw new UnauthorizedException('Refresh token invalido ou expirado.');
    }

    if (session.expiresAt <= now) {
      throw new UnauthorizedException('Refresh token invalido ou expirado.');
    }

    const nextSessionId = this.generateSessionId();
    const tokens = await this.generateTokens(sessionUser, nextSessionId);
    const nextTokenHash = this.hashRefreshToken(tokens.refreshToken);
    const nextRefreshExpiresAt = this.resolveRefreshExpiration(tokens.refreshToken);
    const normalizedContext = this.normalizeSessionContext(sessionContext);

    await this.prisma.$transaction(async (tx) => {
      await tx.refreshSession.update({
        where: { id: session.id },
        data: {
          revokedAt: now,
          lastUsedAt: now,
          replacedBySessionId: nextSessionId,
        },
      });

      await tx.refreshSession.create({
        data: {
          id: nextSessionId,
          userId: sessionUser.id,
          tokenHash: nextTokenHash,
          expiresAt: nextRefreshExpiresAt,
          ipAddress: normalizedContext.ipAddress,
          userAgent: normalizedContext.userAgent,
          lastUsedAt: now,
        },
      });

      await tx.user.update({
        where: { id: sessionUser.id },
        data: {
          lastSeenAt: now,
          lastInactivityReminderAt: null,
        },
      });
    });

    await AuditLogUtil.write(this.prisma, {
      userId: sessionUser.id,
      homeId: sessionUser.homeId,
      action: 'AUTH_REFRESH_ROTATED',
      metadata: {
        previousSessionId: session.id,
        nextSessionId,
      },
    });

    return tokens;
  }

  async listSessions(userId: string, currentSessionId?: string | null) {
    const sessions = await this.prisma.refreshSession.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        createdAt: true,
        lastUsedAt: true,
        expiresAt: true,
        ipAddress: true,
        userAgent: true,
      },
    });

    return sessions.map((session) => ({
      ...session,
      current: currentSessionId ? session.id === currentSessionId : false,
    }));
  }

  async revokeSession(userId: string, targetSessionId: string) {
    const now = new Date();

    const result = await this.prisma.refreshSession.updateMany({
      where: {
        id: targetSessionId,
        userId,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      data: {
        revokedAt: now,
      },
    });

    if (!result.count) {
      throw new NotFoundException('Sessao nao encontrada ou ja encerrada.');
    }

    const actor = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { homeId: true },
    });

    await AuditLogUtil.write(this.prisma, {
      userId,
      homeId: actor?.homeId ?? null,
      action: 'AUTH_SESSION_REVOKED',
      metadata: {
        sessionId: targetSessionId,
      },
    });

    return {
      ok: true,
      revokedSessionId: targetSessionId,
    };
  }

  async logoutAll(userId: string, currentSessionId?: string | null, keepCurrent = false) {
    const now = new Date();
    const result = await this.prisma.refreshSession.updateMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: now },
        ...(keepCurrent && currentSessionId
          ? {
              id: {
                not: currentSessionId,
              },
            }
          : {}),
      },
      data: {
        revokedAt: now,
      },
    });

    const actor = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { homeId: true },
    });

    await AuditLogUtil.write(this.prisma, {
      userId,
      homeId: actor?.homeId ?? null,
      action: 'USER_LOGGED_OUT_ALL',
      metadata: {
        revokedSessions: result.count,
        keepCurrent: Boolean(keepCurrent && currentSessionId),
      },
    });

    return {
      ok: true,
      revokedSessions: result.count,
      keepCurrent: Boolean(keepCurrent && currentSessionId),
    };
  }

  async requestPasswordReset(identifier: string) {
    const normalizedIdentifier = identifier.trim();
    if (!normalizedIdentifier) {
      throw new BadRequestException('Informe e-mail ou telefone');
    }

    const where = looksLikeEmail(normalizedIdentifier)
      ? { email: normalizedIdentifier.toLowerCase() }
      : { phone: normalizePhoneNumber(normalizedIdentifier) };

    const user = await this.prisma.user.findFirst({
      where,
      select: {
        id: true,
        email: true,
        phone: true,
        homeId: true,
      },
    });

    if (!user) {
      return {
        message: 'Se o identificador existir, voce recebera instrucoes de recuperacao.',
      };
    }

    const resetToken = randomBytes(32).toString('hex');
    const tokenHash = this.hashResetToken(resetToken);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    await this.prisma.$transaction(async (tx) => {
      await tx.passwordResetToken.updateMany({
        where: {
          userId: user.id,
          usedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: {
          usedAt: new Date(),
        },
      });

      await tx.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt,
        },
      });
    });

    await AuditLogUtil.write(this.prisma, {
      userId: user.id,
      homeId: user.homeId,
      action: 'PASSWORD_RESET_REQUESTED',
      metadata: {
        identifierType: looksLikeEmail(normalizedIdentifier) ? 'email' : 'phone',
      },
    });

    await this.passwordResetDeliveryService.sendResetInstructions({
      userId: user.id,
      email: user.email,
      token: resetToken,
      expiresAt,
    });

    const response: Record<string, unknown> = {
      message: 'Se o identificador existir, voce recebera instrucoes de recuperacao.',
    };

    if (process.env.NODE_ENV !== 'production') {
      response.resetToken = resetToken;
      response.expiresAt = expiresAt.toISOString();
    }

    return response;
  }

  async resetPassword(token: string, password: string) {
    const tokenHash = this.hashResetToken(token);
    const reset = await this.prisma.passwordResetToken.findFirst({
      where: {
        tokenHash,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        userId: true,
        user: {
          select: {
            id: true,
            homeId: true,
          },
        },
      },
    });

    if (!reset) {
      throw new BadRequestException('Token de recuperacao invalido ou expirado.');
    }

    const passwordHash = await HashUtil.hash(password);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: reset.userId },
        data: { password: passwordHash },
      });

      await tx.passwordResetToken.update({
        where: { id: reset.id },
        data: { usedAt: new Date() },
      });

      await tx.passwordResetToken.updateMany({
        where: {
          userId: reset.userId,
          usedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: {
          usedAt: new Date(),
        },
      });

      await tx.refreshSession.updateMany({
        where: {
          userId: reset.userId,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: {
          revokedAt: new Date(),
        },
      });
    });

    await AuditLogUtil.write(this.prisma, {
      userId: reset.user.id,
      homeId: reset.user.homeId,
      action: 'PASSWORD_RESET_COMPLETED',
    });

    return { message: 'Senha redefinida com sucesso.' };
  }

  async touchActivity(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        lastSeenAt: new Date(),
        lastInactivityReminderAt: null,
      },
    });
    return { ok: true };
  }

  async logout(userId: string, sessionId?: string | null) {
    const now = new Date();
    const where = sessionId
      ? {
          userId,
          id: sessionId,
          revokedAt: null,
          expiresAt: { gt: now },
        }
      : {
          userId,
          revokedAt: null,
          expiresAt: { gt: now },
        };

    const result = await this.prisma.refreshSession.updateMany({
      where,
      data: {
        revokedAt: now,
      },
    });

    const actor = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { homeId: true },
    });

    await AuditLogUtil.write(this.prisma, {
      userId,
      homeId: actor?.homeId ?? null,
      action: 'USER_LOGGED_OUT',
      metadata: {
        revokedSessions: result.count,
        scope: sessionId ? 'session' : 'all',
      },
    });

    return { ok: true, revokedSessions: result.count };
  }

  private async getRefreshSessionWithUser(sessionId: string): Promise<RefreshSessionWithUser | null> {
    return this.prisma.refreshSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        userId: true,
        tokenHash: true,
        expiresAt: true,
        revokedAt: true,
        replacedBySessionId: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            homeId: true,
          },
        },
      },
    }) as Promise<RefreshSessionWithUser | null>;
  }

  private async handleRefreshTokenReuse(
    session: RefreshSessionWithUser,
    reason: string,
    offendingSessionId: string,
  ) {
    if (!session.user) return;

    const revoked = await this.prisma.refreshSession.updateMany({
      where: {
        userId: session.userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: {
        revokedAt: new Date(),
      },
    });

    await AuditLogUtil.write(this.prisma, {
      userId: session.user.id,
      homeId: session.user.homeId,
      action: 'AUTH_REFRESH_REUSE_DETECTED',
      metadata: {
        reason,
        offendingSessionId,
        replacedBySessionId: session.replacedBySessionId ?? null,
        revokedSessions: revoked.count,
      },
    });
  }

  private async issueSessionTokens(user: PublicUser, sessionContext?: SessionContext) {
    const sessionId = this.generateSessionId();
    const tokens = await this.generateTokens(user, sessionId);
    await this.createRefreshSession({
      userId: user.id,
      sessionId,
      refreshToken: tokens.refreshToken,
      sessionContext,
      lastUsedAt: new Date(),
    });
    return tokens;
  }

  private async generateTokens(user: PublicUser, sessionId: string) {
    const basePayload = {
      sub: user.id,
      email: user.email,
      homeId: user.homeId ?? undefined,
      sid: sessionId,
    };
    const accessToken = this.jwtService.sign({
      ...basePayload,
      typ: 'access',
    });
    const refreshToken = this.jwtService.sign(
      {
        ...basePayload,
        typ: 'refresh',
      },
      {
        expiresIn: this.refreshExpiresIn,
        ...(this.refreshSecret ? { secret: this.refreshSecret } : {}),
      },
    );
    return { accessToken, refreshToken };
  }

  private hashResetToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private hashRefreshToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private verifyRefreshToken(refreshToken: string): VerifiedRefreshPayload {
    const normalizedToken = refreshToken.trim();
    if (!normalizedToken) {
      throw new UnauthorizedException('Refresh token invalido ou expirado.');
    }

    let payload: JwtPayload | null = null;

    try {
      payload = this.jwtService.verify<JwtPayload>(normalizedToken, {
        ...(this.refreshSecret ? { secret: this.refreshSecret } : {}),
      });
    } catch {
      throw new UnauthorizedException('Refresh token invalido ou expirado.');
    }

    if (!payload || payload.typ !== 'refresh' || !payload.sid || !payload.sub || !payload.email) {
      throw new UnauthorizedException('Refresh token invalido ou expirado.');
    }

    return payload as VerifiedRefreshPayload;
  }

  private generateSessionId() {
    return randomBytes(18).toString('hex');
  }

  private async createRefreshSession(input: {
    userId: string;
    sessionId: string;
    refreshToken: string;
    sessionContext?: SessionContext;
    lastUsedAt?: Date;
  }) {
    const normalizedContext = this.normalizeSessionContext(input.sessionContext);

    await this.prisma.refreshSession.create({
      data: {
        id: input.sessionId,
        userId: input.userId,
        tokenHash: this.hashRefreshToken(input.refreshToken),
        expiresAt: this.resolveRefreshExpiration(input.refreshToken),
        ipAddress: normalizedContext.ipAddress,
        userAgent: normalizedContext.userAgent,
        lastUsedAt: input.lastUsedAt ?? null,
      },
    });
  }

  private resolveRefreshExpiration(refreshToken: string) {
    const decoded = this.jwtService.decode(refreshToken) as JwtPayload | null;
    if (decoded?.exp && Number.isFinite(decoded.exp)) {
      return new Date(decoded.exp * 1000);
    }

    return new Date(Date.now() + this.parseDurationMs(this.refreshExpiresIn));
  }

  private parseDurationMs(value: string) {
    const normalized = value.trim().toLowerCase();
    const directNumber = Number(normalized);
    if (Number.isFinite(directNumber) && directNumber > 0) {
      return directNumber * 1000;
    }

    const match = normalized.match(/^(\d+)([smhd])$/);
    if (!match) {
      return 30 * 24 * 60 * 60 * 1000;
    }

    const quantity = Number(match[1]);
    const unit = match[2];
    const unitToMs: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };

    return quantity * (unitToMs[unit] ?? 1000);
  }

  private normalizeSessionContext(context?: SessionContext) {
    const ip = context?.ipAddress?.trim();
    const userAgent = context?.userAgent?.trim();

    return {
      ipAddress: ip ? ip.slice(0, 120) : null,
      userAgent: userAgent ? userAgent.slice(0, 500) : null,
    };
  }
}
