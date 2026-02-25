import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class SettleExpenseShareDto {
  @ApiPropertyOptional({ example: 'https://seu-storage/pix-comprovante.png' })
  @IsOptional()
  @IsUrl({}, { message: 'proofUrl deve ser uma URL valida' })
  proofUrl?: string;

  @ApiPropertyOptional({ example: 'Pagamento via PIX para dividir aluguel em 50/50' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  proofDescription?: string;
}
