import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export enum HomePlaceType {
  HOUSE = 'HOUSE',
  APARTMENT = 'APARTMENT',
  BUILDING = 'BUILDING',
  CONDO = 'CONDO',
  STUDIO = 'STUDIO',
  OTHER = 'OTHER',
}

export class CreateHomeDto {
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
