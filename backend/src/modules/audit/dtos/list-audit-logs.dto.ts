import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationDto } from '../../../shared/dtos/pagination.dto';

export class ListAuditLogsDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'Filtra por acao exata (ex.: EXPENSE_CREATED)',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  action?: string;

  @ApiPropertyOptional({
    description: 'Filtra por usuario autor do evento',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  userId?: string;

  @ApiPropertyOptional({
    description: 'Data inicial ISO 8601',
    example: '2026-02-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    description: 'Data final ISO 8601',
    example: '2026-02-20T23:59:59.999Z',
  })
  @IsOptional()
  @IsDateString()
  to?: string;
}
