import { Body, Controller, Delete, Get, Param, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@core/decorators/current-user.decorator';
import { UpdateUserDto } from './dtos/update-user.dto';
import { UserService } from './user.service';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  @ApiOperation({ summary: 'Listar membros da mesma casa do usuario logado' })
  async findAll(@CurrentUser() user: any) {
    return this.userService.findAll(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar usuario por ID (mesma casa ou proprio usuario)' })
  async findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.userService.findOne(user.id, id);
  }

  @Put('me')
  @ApiOperation({ summary: 'Atualizar perfil do usuario logado' })
  async updateMe(@CurrentUser() user: any, @Body() dto: UpdateUserDto) {
    return this.userService.update(user.id, dto);
  }

  @Delete('me')
  @ApiOperation({ summary: 'Excluir conta do usuario logado' })
  async deleteMe(@CurrentUser() user: any) {
    return this.userService.delete(user.id, user.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remover membro da casa ativa (admin)' })
  async delete(@CurrentUser() user: any, @Param('id') id: string) {
    return this.userService.delete(user.id, id);
  }
}
