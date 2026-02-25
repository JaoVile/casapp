import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'voce@email.com ou +5511999999999' })
  @IsString()
  @IsNotEmpty({ message: 'Informe e-mail ou telefone' })
  @Transform(({ value }) => value?.trim())
  identifier: string;

  @ApiProperty({ example: 'Senha@123' })
  @IsString()
  @IsNotEmpty({ message: 'A senha e obrigatoria' })
  @MinLength(6, { message: 'A senha deve ter no minimo 6 caracteres' })
  @MaxLength(72, { message: 'A senha deve ter no maximo 72 caracteres' })
  password: string;
}
