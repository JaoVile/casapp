import { Module } from '@nestjs/common';
import { ShoppingService } from './shopping.service';
import { ShoppingController } from './shopping.controller';
import { PrismaService } from '../../shared/database/prisma.service';
import { NotificationModule } from '../notifications/notification.module';

@Module({
  imports: [NotificationModule],
  controllers: [ShoppingController],
  providers: [ShoppingService, PrismaService],
})
export class ShoppingModule {}
