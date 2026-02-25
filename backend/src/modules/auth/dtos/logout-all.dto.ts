import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

export class LogoutAllDto {
  @ApiPropertyOptional({
    description: 'Quando true, preserva a sessao atual e encerra as demais.',
    default: false,
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  keepCurrent?: boolean = false;
}
