import { Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../core/decorators/current-user.decorator';
import { NotificationListQueryDto } from './dtos/notification.dto';
import { NotificationService } from './notification.service';

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  @ApiOperation({ summary: 'Listar notificacoes do usuario logado' })
  async list(@CurrentUser() user: any, @Query() query: NotificationListQueryDto) {
    return this.notificationService.listForUser(user.id, query);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Retorna quantidade de notificacoes nao lidas' })
  async unreadCount(@CurrentUser() user: any) {
    return this.notificationService.getUnreadCount(user.id);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Marcar notificacao como lida' })
  async markRead(@CurrentUser() user: any, @Param('id') id: string) {
    return this.notificationService.markRead(user.id, id);
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Marcar todas notificacoes como lidas' })
  async markAllRead(@CurrentUser() user: any) {
    return this.notificationService.markAllRead(user.id);
  }
}
