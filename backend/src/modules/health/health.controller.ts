import { Controller, Get, HttpCode, HttpStatus, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../../core/decorators/public.decorator';
import { HealthService } from './health.service';

@ApiTags('Health')
@Controller()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Public()
  @Get('health')
  @ApiOperation({ summary: 'Health check de liveness (app online)' })
  getHealth() {
    return this.healthService.getHealth();
  }

  @Public()
  @Get('ready')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Readiness check (Postgres/Redis/Scheduler)' })
  async getReadiness(@Res({ passthrough: true }) response: Response) {
    const readiness = await this.healthService.getReadiness();
    if (readiness.status === 'degraded') {
      response.status(HttpStatus.SERVICE_UNAVAILABLE);
      return {
        ...readiness,
        ready: false,
      };
    }

    return {
      ...readiness,
      ready: true,
    };
  }

  @Public()
  @Get('metrics')
  @ApiOperation({ summary: 'Metricas operacionais da aplicacao' })
  async getMetrics() {
    return this.healthService.getMetrics();
  }
}
