import { Module } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';
import { JobsController } from './jobs.controller';
import { ReminderJob } from './reminder.job';

@Module({
  controllers: [JobsController],
  providers: [ReminderJob, PrismaService],
})
export class JobsModule {}
