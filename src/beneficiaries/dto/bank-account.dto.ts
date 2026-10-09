import { Transform } from 'class-transformer';
import { IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BankAccountDto {
  @ApiProperty({
    example: '058',
    description: 'Bank code from the banks endpoint; keep leading zeros',
  })
  @Transform(({ obj }: { obj: Record<string, unknown> }) => obj.bankCode)
  @IsString()
  @Matches(/^[A-Za-z0-9]{2,20}$/)
  bankCode!: string;

  @ApiProperty({
    example: '0001234567',
    description: 'Ten-digit Nigerian account number, as a string',
  })
  @Transform(({ obj }: { obj: Record<string, unknown> }) => obj.accountNumber)
  @IsString()
  @Matches(/^\d{10}$/)
  accountNumber!: string;
}
