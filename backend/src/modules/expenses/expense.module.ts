import { Module } from '@nestjs/common';
import { ExpenseController } from './expense.controller';
import { ExpenseService } from './expense.service';
import { PrismaService } from '@shared/database/prisma.service';
import { NotificationModule } from '../notifications/notification.module';

@Module({
  imports: [NotificationModule],
  controllers: [ExpenseController],
  providers: [ExpenseService, PrismaService],
  exports: [ExpenseService],
})
export class ExpenseModule {}
