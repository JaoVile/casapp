import { Priority } from '@prisma/client';
import { IsString, IsNumber, IsOptional, IsBoolean, Min, MaxLength, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AddItemDto {
  @ApiProperty({ example: 'Leite' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'Marca integral 1L', required: false })
  @IsString()
  @IsOptional()
  @MaxLength(200)
  description?: string;

  @ApiProperty({ example: 2, required: false })
  @IsNumber()
  @IsOptional()
  @Min(1)
  quantity?: number;

  @ApiProperty({ example: 12.5, required: false })
  @IsNumber()
  @IsOptional()
  @Min(0.01)
  currentPrice?: number;

  @ApiProperty({ example: true, required: false })
  @IsBoolean()
  @IsOptional()
  useAveragePrice?: boolean;

  @ApiProperty({ example: 14.9, required: false })
  @IsNumber()
  @IsOptional()
  @Min(0.01)
  targetPriceMax?: number;

  @ApiProperty({ example: 'HIGH', required: false, enum: Priority })
  @IsEnum(Priority)
  @IsOptional()
  priority?: Priority;

  @ApiProperty({ example: true, required: false })
  @IsBoolean()
  @IsOptional()
  alertOnPrice?: boolean;

  @ApiProperty({ example: true, required: false })
  @IsBoolean()
  @IsOptional()
  isRunningLow?: boolean;
}
