import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString } from 'class-validator';

export class UpdateExpenseStatusDto {
  @ApiProperty({ enum: ['OPEN', 'CLOSED'] })
  @IsString()
  @IsIn(['OPEN', 'CLOSED'])
  status: 'OPEN' | 'CLOSED';
}

