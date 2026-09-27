import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class FundWalletDto {
  @ApiProperty({
    example: '100.50',
    description: 'Amount in NGN as a decimal string (naira)',
  })
  @Transform(({ obj }: { obj: Record<string, unknown> }) => obj.amount)
  @IsString()
  @MaxLength(20)
  @Matches(/^(0|[1-9]\d*)(\.\d{1,2})?$/)
  amount!: string;
}
