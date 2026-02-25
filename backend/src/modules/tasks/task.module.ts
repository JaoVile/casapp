import { Module } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';
import { TaskController } from './task.controller';
import { TaskService } from './task.service';
import { NotificationModule } from '../notifications/notification.module';

@Module({
  imports: [NotificationModule],
  controllers: [TaskController],
  providers: [TaskService, PrismaService],
  exports: [TaskService],
})
export class TaskModule {}
