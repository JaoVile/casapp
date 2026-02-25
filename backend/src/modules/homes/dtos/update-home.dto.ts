import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { HomePlaceType } from './create-home.dto';

export class UpdateHomeDto {
  @ApiProperty({ example: 'Meu lar' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @ApiProperty({
    required: false,
    enum: HomePlaceType,
    example: HomePlaceType.APARTMENT,
  })
  @IsOptional()
  @IsEnum(HomePlaceType)
  placeType?: HomePlaceType;
}
