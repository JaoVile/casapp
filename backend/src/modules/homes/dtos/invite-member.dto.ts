import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty } from 'class-validator';

export class InviteMemberDto {
  @ApiProperty({ example: 'membro@exemplo.com' })
  @IsEmail()
  @IsNotEmpty()
  @Transform(({ value }) => value?.trim()?.toLowerCase())
  email: string;
}
