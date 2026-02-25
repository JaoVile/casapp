import { Body, Controller, Delete, Get, Patch, Post, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../core/decorators/current-user.decorator';
import { HomeMemberGuard } from '../../core/guards/home-member.guard';
import { CreateExpenseDto } from './dtos/create-expense.dto';
import { ExpenseFiltersDto } from './dtos/expense-filters.dto';
import { SettleExpenseShareDto } from './dtos/settle-expense-share.dto';
import { UpdateExpenseStatusDto } from './dtos/update-expense-status.dto';
import { ExpenseService } from './expense.service';

@ApiTags('Expenses')
@ApiBearerAuth()
@Controller('expenses')
export class ExpenseController {
  constructor(private readonly expenseService: ExpenseService) {}

  @Get('balances')
  @UseGuards(HomeMemberGuard)
  @ApiOperation({ summary: 'Ver saldos entre membros da casa' })
  async getBalances(@CurrentUser() user: any) {
    return this.expenseService.getBalances(user.id);
  }

  @Get('categories')
  @UseGuards(HomeMemberGuard)
  @ApiOperation({ summary: 'Listar categorias da casa do usuario logado' })
  async getCategories(@CurrentUser() user: any) {
    return this.expenseService.getCategories(user.id);
  }

  @Get('debts/me')
  @UseGuards(HomeMemberGuard)
  @ApiOperation({ summary: 'Listar minhas dividas pendentes com detalhes do split' })
  async getMyDebts(@CurrentUser() user: any) {
    return this.expenseService.getMyDebts(user.id);
  }

  @Post()
  @UseGuards(HomeMemberGuard)
  @ApiOperation({ summary: 'Criar nova despesa com divisao igual/customizada' })
  async create(@CurrentUser() user: any, @Body() dto: CreateExpenseDto) {
    return this.expenseService.create(user.id, dto);
  }

  @Patch('shares/:shareId/settle')
  @UseGuards(HomeMemberGuard)
  @ApiOperation({ summary: 'Quitar parcela com comprovante PIX opcional' })
  async settleShare(
    @CurrentUser() user: any,
    @Param('shareId') shareId: string,
    @Body() dto: SettleExpenseShareDto,
  ) {
    return this.expenseService.settleShare(user.id, shareId, dto);
  }

  @Patch(':expenseId/status')
  @UseGuards(HomeMemberGuard)
  @ApiOperation({ summary: 'Atualizar status da conta (aberta ou acabada)' })
  async updateStatus(
    @CurrentUser() user: any,
    @Param('expenseId') expenseId: string,
    @Body() dto: UpdateExpenseStatusDto,
  ) {
    return this.expenseService.updateStatus(user.id, expenseId, dto);
  }

  @Delete(':expenseId')
  @UseGuards(HomeMemberGuard)
  @ApiOperation({ summary: 'Excluir conta dentro da janela de 24 horas' })
  async remove(@CurrentUser() user: any, @Param('expenseId') expenseId: string) {
    return this.expenseService.remove(user.id, expenseId);
  }

  @Get()
  @UseGuards(HomeMemberGuard)
  @ApiOperation({ summary: 'Listar despesas da casa' })
  async findAll(@CurrentUser() user: any, @Query() filters: ExpenseFiltersDto) {
    return this.expenseService.findAll(user.id, filters);
  }
}
