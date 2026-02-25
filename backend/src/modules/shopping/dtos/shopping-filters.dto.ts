import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '../../../shared/dtos/pagination.dto';

export class ShoppingFiltersDto extends PaginationDto {
  @ApiPropertyOptional({ default: 100, minimum: 1, maximum: 300 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(300)
  itemLimit?: number = 100;
}
