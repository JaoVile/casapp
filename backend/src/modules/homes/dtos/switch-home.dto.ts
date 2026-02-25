import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class SwitchHomeDto {
  @ApiProperty({ example: 'cmlwfgg1d0000imaqtr1zqa12' })
  @IsString()
  @MinLength(3)
  homeId: string;
}
