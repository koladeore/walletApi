import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength, IsEmail, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class TransferDto {
  @ApiProperty({
    example: 'receiver@example.com',
    description: 'The email of the user to transfer funds to',
  })
  @IsEmail()
  @IsNotEmpty()
  receiverEmail!: string;

  @ApiProperty({
    example: '50.00',
    description: 'Amount in NGN as a decimal string (naira)',
  })
  @Transform(({ obj }: { obj: Record<string, unknown> }) => obj.amount)
  @IsString()
  @MaxLength(20)
  @Matches(/^(0|[1-9]\d*)(\.\d{1,2})?$/)
  amount!: string;
}
