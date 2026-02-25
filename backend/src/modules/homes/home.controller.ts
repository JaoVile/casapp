import { Controller, Post, Get, Body, Param, Patch, Delete, Put } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { HomeService } from './home.service';
import { CreateHomeDto } from './dtos/create-home.dto';
import { JoinHomeDto } from './dtos/join-home.dto';
import { InviteMemberDto } from './dtos/invite-member.dto';
import { SwitchHomeDto } from './dtos/switch-home.dto';
import { UpdateHomeDto } from './dtos/update-home.dto';
import { CurrentUser } from '@core/decorators/current-user.decorator';

@ApiTags('Homes')
@ApiBearerAuth()
@Controller('homes')
export class HomeController {
  constructor(private readonly homeService: HomeService) {}

  @Post()
  @ApiOperation({ summary: 'Criar nova casa' })
  async create(@CurrentUser() user: any, @Body() dto: CreateHomeDto) {
    return this.homeService.create(user.id, dto);
  }

  @Post('join')
  @ApiOperation({ summary: 'Entrar em uma casa com código' })
  async join(@CurrentUser() user: any, @Body() dto: JoinHomeDto) {
    return this.homeService.join(user.id, dto);
  }

  @Get('my')
  @ApiOperation({ summary: 'Listar casas do usuario e identificar a ativa' })
  async listMyHomes(@CurrentUser() user: any) {
    return this.homeService.listMyHomes(user.id);
  }

  @Post('switch')
  @ApiOperation({ summary: 'Trocar casa ativa do usuario' })
  async switchHome(@CurrentUser() user: any, @Body() dto: SwitchHomeDto) {
    return this.homeService.switchHome(user.id, dto);
  }

  @Get('invite/me')
  @ApiOperation({ summary: 'Obter dados de convite da casa atual' })
  async getMyInvite(@CurrentUser() user: any) {
    return this.homeService.getMyInvite(user.id);
  }

  @Post('invite/email')
  @ApiOperation({ summary: 'Enviar convite por e-mail para entrar na casa' })
  async inviteByEmail(@CurrentUser() user: any, @Body() dto: InviteMemberDto) {
    return this.homeService.inviteByEmail(user.id, dto);
  }

  @Post('leave')
  @ApiOperation({ summary: 'Sair da casa atual' })
  async leave(@CurrentUser() user: any) {
    return this.homeService.leave(user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualizar dados da casa (admin)' })
  async update(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: UpdateHomeDto) {
    return this.homeService.update(user.id, id, dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Atualizar dados da casa (admin) - compatibilidade PUT' })
  async updateByPut(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: UpdateHomeDto) {
    return this.homeService.update(user.id, id, dto);
  }

  @Post(':id/update')
  @ApiOperation({ summary: 'Atualizar dados da casa (admin) - compatibilidade POST' })
  async updateByPost(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: UpdateHomeDto) {
    return this.homeService.update(user.id, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Excluir casa (admin)' })
  async remove(@CurrentUser() user: any, @Param('id') id: string) {
    return this.homeService.remove(user.id, id);
  }

  @Post(':id/delete')
  @ApiOperation({ summary: 'Excluir casa (admin) - compatibilidade POST' })
  async removeByPost(@CurrentUser() user: any, @Param('id') id: string) {
    return this.homeService.remove(user.id, id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar casa por ID' })
  async findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.homeService.findOneForUser(user.id, id);
  }
}
