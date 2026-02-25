import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class ExpenseSplitShareDto {
  @ApiProperty({ example: 'ckx...userId' })
  @IsString()
  userId: string;

  @ApiProperty({ example: 33.33 })
  @IsNumber()
  @Min(0.01)
  percent: number;
}

export class CreateExpenseDto {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  description: string;

  @ApiProperty()
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiProperty()
  @IsString()
  categoryId: string;

  @ApiPropertyOptional({ enum: ['EQUAL', 'CUSTOM', 'INDIVIDUAL'] })
  @IsOptional()
  @IsString()
  splitType?: string;

  @ApiPropertyOptional({ type: [ExpenseSplitShareDto] })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ExpenseSplitShareDto)
  customSplits?: ExpenseSplitShareDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(3000)
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  receipt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  date?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional({ description: 'Ativa envio de alerta de vencimento via webhook/notificacao.' })
  @IsOptional()
  @IsBoolean()
  reminderEnabled?: boolean;

  @ApiPropertyOptional({ enum: ['NONE', 'MONTHLY'], default: 'NONE' })
  @IsOptional()
  @IsString()
  @IsIn(['NONE', 'MONTHLY'])
  recurrenceType?: 'NONE' | 'MONTHLY';

  @ApiPropertyOptional({ description: 'Repete a cada X meses (somente para MONTHLY).', minimum: 1, maximum: 12 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  recurrenceIntervalMonths?: number;

  @ApiPropertyOptional({
    description: 'Quantidade de dias antes do vencimento para disparar alerta.',
    minimum: 0,
    maximum: 30,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(30)
  reminderDaysBefore?: number;
}
