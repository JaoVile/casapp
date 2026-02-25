import { IsIn, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { TASK_FREQUENCIES, type TaskFrequency } from './create-task.dto';

export class UpdateTaskDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  points?: number;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  description?: string;

  @IsOptional()
  @IsString()
  @IsIn(TASK_FREQUENCIES)
  frequency?: TaskFrequency;
}
