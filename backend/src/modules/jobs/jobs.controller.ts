import {
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../../core/decorators/public.decorator';
import { ReminderJob } from './reminder.job';

@ApiTags('Jobs')
@Controller('jobs')
export class JobsController {
  constructor(private readonly reminderJob: ReminderJob) {}

  @Public()
  @Post('reminders/inactive-users/run')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Disparar reminder de inatividade/dividas manualmente (Cloud Scheduler)' })
  async runInactiveUsersReminder(@Req() req: Request) {
    const expectedToken = process.env.JOB_REMINDER_TRIGGER_TOKEN?.trim();
    if (!expectedToken) {
      throw new ForbiddenException('Trigger manual de reminder desabilitado no servidor.');
    }

    const providedToken = this.extractTriggerToken(req);
    if (!providedToken || providedToken !== expectedToken) {
      throw new UnauthorizedException('Token de trigger de job invalido.');
    }

    await this.reminderJob.runInactiveUsersReminder({
      trigger: 'http',
      ignoreInternalCronGate: true,
    });

    return {
      ok: true,
      trigger: 'http',
      triggeredAt: new Date().toISOString(),
    };
  }

  private extractTriggerToken(req: Request) {
    const fromHeader = req.headers['x-job-token'];
    if (typeof fromHeader === 'string' && fromHeader.trim()) {
      return fromHeader.trim();
    }

    if (Array.isArray(fromHeader) && fromHeader.length > 0) {
      const first = fromHeader[0]?.trim();
      if (first) return first;
    }

    const auth = req.headers.authorization;
    if (!auth) return null;

    const [scheme, token] = auth.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token?.trim()) {
      return null;
    }

    return token.trim();
  }
}
