import { Module } from '@nestjs/common';
import { HomeController } from './home.controller';
import { HomeService } from './home.service';
import { PrismaService } from '../../shared/database/prisma.service';
import { NotificationModule } from '../notifications/notification.module';
import { StructuredLoggerService } from '../../shared/services/structured-logger.service';
import { SentryService } from '../../shared/services/sentry.service';
import { HomeInviteDeliveryService } from './services/home-invite-delivery.service';

@Module({
  imports: [NotificationModule],
  controllers: [HomeController],
  providers: [
    HomeService,
    PrismaService,
    StructuredLoggerService,
    SentryService,
    HomeInviteDeliveryService,
  ],
  exports: [HomeService],
})
export class HomeModule {}
