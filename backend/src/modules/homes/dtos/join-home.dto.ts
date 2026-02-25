import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class JoinHomeDto {
  @ApiProperty({ required: false, example: 'CASA-8H9K2P4D' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  inviteCode?: string;

  @ApiProperty({ required: false, example: 'CASA-8H9K2P4D' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  homeCode?: string;
}
