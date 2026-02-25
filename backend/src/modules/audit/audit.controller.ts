import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../core/decorators/current-user.decorator';
import { ListAuditLogsDto } from './dtos/list-audit-logs.dto';
import { AuditService } from './audit.service';

@ApiTags('Audit Logs')
@ApiBearerAuth()
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @ApiOperation({
    summary: 'Listar eventos de auditoria da casa atual (somente admin)',
  })
  async list(@CurrentUser() user: any, @Query() query: ListAuditLogsDto) {
    return this.auditService.list(user.id, query);
  }
}
