import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'voce@email.com ou +5511999999999' })
  @IsString()
  @IsNotEmpty({ message: 'Informe e-mail ou telefone' })
  @Transform(({ value }) => value?.trim())
  identifier: string;
}
