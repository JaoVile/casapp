import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD, APP_INTERCEPTOR, APP_FILTER } from '@nestjs/core';

// Config
import { appConfig, databaseConfig, jwtConfig } from './core/config';

// Core
import { JwtAuthGuard } from './core/guards/jwt-auth.guard';
import { LoggingInterceptor } from './core/interceptors/logging.interceptor';
import { TransformInterceptor } from './core/interceptors/transform.interceptor';
import { HttpExceptionFilter } from './core/filters/http-exception.filter';

// Shared
import { PrismaService } from './shared/database/prisma.service';
import { RedisModule } from './shared/redis/redis.module';
import { SentryService } from './shared/services/sentry.service';

// Modules
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/users/user.module';
import { HomeModule } from './modules/homes/home.module';
import { ExpenseModule } from './modules/expenses/expense.module';
import { ShoppingModule } from './modules/shopping/shopping.module';
import { TaskModule } from './modules/tasks/task.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { HealthModule } from './modules/health/health.module';
import { AuditModule } from './modules/audit/audit.module';
import { NotificationModule } from './modules/notifications/notification.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, jwtConfig],
    }),
    RedisModule,
    ScheduleModule.forRoot(),
    AuthModule,
    UserModule,
    HomeModule,
    ExpenseModule,
    ShoppingModule,
    TaskModule,
    JobsModule,
    HealthModule,
    AuditModule,
    NotificationModule,
  ],
  providers: [
    PrismaService,
    SentryService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TransformInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
  ],
})
export class AppModule {}
