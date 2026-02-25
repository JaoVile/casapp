import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ShoppingService } from './shopping.service';
import { HomeMemberGuard } from '../../core/guards/home-member.guard';
import { CurrentUser } from '../../core/decorators/current-user.decorator';
import { AddItemDto } from './dtos/add-item.dto';
import { ShoppingFiltersDto } from './dtos/shopping-filters.dto';
import { ShoppingInsightsDto } from './dtos/shopping-insights.dto';
import { UpdateItemDto } from './dtos/update-item.dto';

@ApiTags('Shopping')
@ApiBearerAuth()
@UseGuards(HomeMemberGuard)
@Controller('shopping')
export class ShoppingController {
  constructor(private readonly shoppingService: ShoppingService) {}

  @Get()
  @ApiOperation({ summary: 'Listar listas de compras da casa' })
  getLists(@CurrentUser() user: any, @Query() filters: ShoppingFiltersDto) {
    return this.shoppingService.getLists(user.homeId, filters);
  }

  @Get('insights')
  @ApiOperation({ summary: 'Resumo mensal e sugestoes inteligentes de compras' })
  getInsights(@CurrentUser() user: any, @Query() filters: ShoppingInsightsDto) {
    return this.shoppingService.getInsights(user.homeId, filters);
  }

  @Post(':listId/items')
  @ApiOperation({ summary: 'Adicionar item na lista' })
  addItem(
    @CurrentUser() user: any,
    @Param('listId') listId: string,
    @Body() dto: AddItemDto
  ) {
    return this.shoppingService.addItem(user.id, user.homeId, listId, dto);
  }

  @Patch('items/:itemId/toggle')
  @ApiOperation({ summary: 'Marcar/Desmarcar item' })
  toggleItem(@CurrentUser() user: any, @Param('itemId') itemId: string) {
    return this.shoppingService.toggleItem(user.id, user.homeId, itemId);
  }

  @Patch('items/:itemId')
  @ApiOperation({ summary: 'Editar item da lista' })
  updateItem(
    @CurrentUser() user: any,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateItemDto,
  ) {
    return this.shoppingService.updateItem(user.id, user.homeId, itemId, dto);
  }

  @Delete('items/:itemId')
  @ApiOperation({ summary: 'Remover item' })
  deleteItem(@CurrentUser() user: any, @Param('itemId') itemId: string) {
    return this.shoppingService.deleteItem(user.id, user.homeId, itemId);
  }
}
