import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UnauthorizedException,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser } from '../../core/decorators/current-user.decorator';
import { Public } from '../../core/decorators/public.decorator';
import { AuthRateLimitService } from './services/auth-rate-limit.service';
import { AuthService } from './auth.service';
import { ForgotPasswordDto } from './dtos/forgot-password.dto';
import { LoginDto } from './dtos/login.dto';
import { LogoutAllDto } from './dtos/logout-all.dto';
import { RegisterDto } from './dtos/register.dto';
import { ResetPasswordDto } from './dtos/reset-password.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly authRateLimitService: AuthRateLimitService,
  ) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Criar nova conta' })
  async register(@Body() dto: RegisterDto, @Req() req: Request) {
    const ip = this.getClientIp(req);
    const rateKey = `register:ip:${ip}`;
    await this.authRateLimitService.assertAllowed(rateKey);

    try {
      const result = await this.authService.register(dto, {
        ipAddress: ip,
        userAgent: this.getUserAgent(req),
      });
      await this.authRateLimitService.registerSuccess(rateKey);
      return result;
    } catch (error) {
      await this.authRateLimitService.registerFailure(rateKey);
      throw error;
    }
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Fazer login com e-mail ou telefone' })
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    const ip = this.getClientIp(req);
    const rawIdentifier = dto.identifier.trim().toLowerCase();
    const identifierKey = rawIdentifier.includes('@')
      ? rawIdentifier
      : rawIdentifier.replace(/\D/g, '');

    const rateKeys = [`login:ip:${ip}`, `login:identifier:${identifierKey}`];
    await this.authRateLimitService.assertAllowed(rateKeys);

    try {
      const user = await this.authService.validateUser(dto.identifier, dto.password);
      const result = await this.authService.login(user, {
        ipAddress: ip,
        userAgent: this.getUserAgent(req),
      });
      await this.authRateLimitService.registerSuccess(rateKeys);
      return result;
    } catch (error) {
      await this.authRateLimitService.registerFailure(rateKeys);
      throw error;
    }
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Solicitar recuperacao de senha' })
  async forgotPassword(@Body() dto: ForgotPasswordDto, @Req() req: Request) {
    const ip = this.getClientIp(req);
    const rateKeys = [`forgot:ip:${ip}`];
    await this.authRateLimitService.assertAllowed(rateKeys);

    try {
      const result = await this.authService.requestPasswordReset(dto.identifier);
      await this.authRateLimitService.registerSuccess(rateKeys);
      return result;
    } catch (error) {
      await this.authRateLimitService.registerFailure(rateKeys);
      throw error;
    }
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Redefinir senha com token de recuperacao' })
  async resetPassword(@Body() dto: ResetPasswordDto, @Req() req: Request) {
    const ip = this.getClientIp(req);
    const rateKey = `reset:ip:${ip}`;
    await this.authRateLimitService.assertAllowed(rateKey);

    try {
      const result = await this.authService.resetPassword(dto.token, dto.password);
      await this.authRateLimitService.registerSuccess(rateKey);
      return result;
    } catch (error) {
      await this.authRateLimitService.registerFailure(rateKey);
      throw error;
    }
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obter usuario logado' })
  async me(@CurrentUser() user: any) {
    return this.authService.getProfile(user.id);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Renovar token' })
  async refresh(@Req() req: Request) {
    const ip = this.getClientIp(req);
    const rateKey = `refresh:ip:${ip}`;
    await this.authRateLimitService.assertAllowed(rateKey);

    const refreshToken = this.extractBearerToken(req);

    try {
      const result = await this.authService.refreshToken(refreshToken, {
        ipAddress: ip,
        userAgent: this.getUserAgent(req),
      });
      await this.authRateLimitService.registerSuccess(rateKey);
      return result;
    } catch (error) {
      await this.authRateLimitService.registerFailure(rateKey);
      throw error;
    }
  }

  @Post('activity')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Registrar atividade do usuario para automacoes' })
  async activity(@CurrentUser() user: any) {
    return this.authService.touchActivity(user.id);
  }

  @Post('logout')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout (revoga sessao atual)' })
  async logout(@CurrentUser() user: any) {
    return this.authService.logout(user.id, user.sessionId ?? null);
  }

  @Get('sessions')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Listar sessoes ativas do usuario' })
  async listSessions(@CurrentUser() user: any) {
    return this.authService.listSessions(user.id, user.sessionId ?? null);
  }

  @Delete('sessions/:sessionId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Encerrar uma sessao especifica' })
  async revokeSession(@CurrentUser() user: any, @Param('sessionId') sessionId: string) {
    return this.authService.revokeSession(user.id, sessionId);
  }

  @Post('logout-all')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Encerrar todas as sessoes (opcionalmente mantendo a atual)' })
  async logoutAll(@CurrentUser() user: any, @Body() dto: LogoutAllDto) {
    return this.authService.logoutAll(user.id, user.sessionId ?? null, dto.keepCurrent ?? false);
  }

  private getClientIp(req: Request) {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim()) {
      return forwarded.split(',')[0].trim();
    }

    if (Array.isArray(forwarded) && forwarded.length > 0) {
      return forwarded[0].trim();
    }

    return req.ip || req.socket.remoteAddress || 'unknown';
  }

  private getUserAgent(req: Request) {
    const value = req.headers['user-agent'];
    if (typeof value === 'string') return value;
    return null;
  }

  private extractBearerToken(req: Request) {
    const rawAuth = req.headers.authorization;
    if (!rawAuth) {
      throw new UnauthorizedException('Refresh token ausente.');
    }

    const [scheme, token] = rawAuth.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      throw new UnauthorizedException('Refresh token invalido.');
    }

    return token.trim();
  }
}
