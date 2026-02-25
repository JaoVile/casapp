import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'João Silva' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ example: 'https://avatar.url/image.jpg' })
  @IsOptional()
  @IsString()
  avatar?: string;

  @ApiPropertyOptional({ example: 'novo@email.com' })
  @IsOptional()
  @IsEmail({}, { message: 'Informe um e-mail valido' })
  @Transform(({ value }) => value?.trim()?.toLowerCase())
  email?: string;

  @ApiPropertyOptional({ example: 'SenhaAtual@123' })
  @IsOptional()
  @IsString()
  @MinLength(8, { message: 'A senha atual deve ter no minimo 8 caracteres' })
  @MaxLength(72, { message: 'A senha atual deve ter no maximo 72 caracteres' })
  currentPassword?: string;

  @ApiPropertyOptional({ example: 'NovaSenha@123' })
  @IsOptional()
  @IsString()
  @MinLength(8, { message: 'A nova senha deve ter no minimo 8 caracteres' })
  @MaxLength(72, { message: 'A nova senha deve ter no maximo 72 caracteres' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).+$/, {
    message: 'A nova senha precisa conter letra maiuscula, minuscula, numero e simbolo',
  })
  newPassword?: string;

  @ApiPropertyOptional({ example: 'joao@email.com' })
  @IsOptional()
  @IsString()
  pixKey?: string;
}
