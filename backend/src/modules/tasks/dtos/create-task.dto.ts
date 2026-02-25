import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export const TASK_FREQUENCIES = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] as const;
export type TaskFrequency = (typeof TASK_FREQUENCIES)[number];

export class CreateTaskDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(120)
  title: string;

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

  @IsOptional()
  @IsString()
  assignedToId?: string;
}
