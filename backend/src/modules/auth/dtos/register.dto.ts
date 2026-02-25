import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'Joao Silva' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(100)
  @Transform(({ value }) => value?.trim())
  name: string;

  @ApiProperty({ example: 'joao@email.com' })
  @IsEmail()
  @Transform(({ value }) => value?.trim()?.toLowerCase())
  email: string;

  @ApiPropertyOptional({ example: '(11) 99888-7777' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  phone?: string;

  @ApiProperty({ example: 'Senha@123' })
  @IsString()
  @IsNotEmpty()
  @MinLength(8, { message: 'A senha deve ter no minimo 8 caracteres' })
  @MaxLength(72, { message: 'A senha deve ter no maximo 72 caracteres' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).+$/, {
    message: 'A senha precisa conter letra maiuscula, minuscula, numero e simbolo',
  })
  password: string;

  @ApiProperty({ example: 'clx1y2z3a0000abc...', required: false })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  inviteCode?: string;
}
