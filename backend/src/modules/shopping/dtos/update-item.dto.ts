import { Priority } from '@prisma/client';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateItemDto {
  @ApiPropertyOptional({ example: 'Leite integral' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ example: 'Marca da promocao da semana' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  quantity?: number;

  @ApiPropertyOptional({ example: 12.9 })
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  currentPrice?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  useAveragePrice?: boolean;

  @ApiPropertyOptional({ example: 15.9 })
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  targetPriceMax?: number;

  @ApiPropertyOptional({ example: 'HIGH', enum: Priority })
  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  alertOnPrice?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isRunningLow?: boolean;
}

