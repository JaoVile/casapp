import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({ example: 'token-enviado-no-email-ou-canal-definido' })
  @IsString()
  @IsNotEmpty({ message: 'Token de recuperacao obrigatorio' })
  @MinLength(20)
  token: string;

  @ApiProperty({ example: 'NovaSenha@123' })
  @IsString()
  @IsNotEmpty({ message: 'A senha e obrigatoria' })
  @MinLength(8, { message: 'A senha deve ter no minimo 8 caracteres' })
  @MaxLength(72, { message: 'A senha deve ter no maximo 72 caracteres' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).+$/, {
    message: 'A senha precisa conter letra maiuscula, minuscula, numero e simbolo',
  })
  password: string;
}
