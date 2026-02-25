import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TaskService } from './task.service';
import { HomeMemberGuard } from '../../core/guards/home-member.guard';
import { CurrentUser } from '../../core/decorators/current-user.decorator';
import { CreateTaskDto } from './dtos/create-task.dto';
import { TaskFiltersDto } from './dtos/task-filters.dto';
import { UpdateTaskDto } from './dtos/update-task.dto';

@ApiTags('Tasks')
@ApiBearerAuth()
@UseGuards(HomeMemberGuard)
@Controller('tasks')
export class TaskController {
  constructor(private readonly taskService: TaskService) {}

  @Get()
  @ApiOperation({ summary: 'Listar tarefas' })
  findAll(@CurrentUser() user: any, @Query() filters: TaskFiltersDto) {
    return this.taskService.findAll(user.homeId, filters);
  }

  @Get('leaderboard')
  @ApiOperation({ summary: 'Ver ranking de pontos' })
  getLeaderboard(@CurrentUser() user: any) {
    return this.taskService.getLeaderboard(user.homeId);
  }

  @Get('progress/me')
  @ApiOperation({ summary: 'Ver meu nivel e progresso por pontos' })
  getMyProgress(@CurrentUser() user: any) {
    return this.taskService.getMyProgress(user.homeId, user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Criar tarefa' })
  create(@CurrentUser() user: any, @Body() dto: CreateTaskDto) {
    return this.taskService.create(user.homeId, dto, user.id);
  }

  @Patch(':id/toggle')
  @ApiOperation({ summary: 'Marcar como feita' })
  toggle(@CurrentUser() user: any, @Param('id') id: string) {
    return this.taskService.toggleComplete(user.homeId, id, user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Editar tarefa' })
  update(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: UpdateTaskDto) {
    return this.taskService.update(user.homeId, id, dto, user.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remover tarefa' })
  remove(@CurrentUser() user: any, @Param('id') id: string) {
    return this.taskService.remove(user.homeId, id, user.id);
  }
}
