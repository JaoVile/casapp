import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { LocalStrategy } from './strategies/local.strategy';
import { PrismaService } from '@shared/database/prisma.service';
import { AuthRateLimitService } from './services/auth-rate-limit.service';
import { PasswordResetDeliveryService } from './services/password-reset-delivery.service';
import { StructuredLoggerService } from '../../shared/services/structured-logger.service';
import { SentryService } from '../../shared/services/sentry.service';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get('jwt.secret'),
        signOptions: {
          expiresIn: config.get('jwt.expiresIn'),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    LocalStrategy,
    PrismaService,
    AuthRateLimitService,
    PasswordResetDeliveryService,
    StructuredLoggerService,
    SentryService,
  ],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
