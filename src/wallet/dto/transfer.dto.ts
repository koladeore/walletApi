import { IsNumber, IsPositive, IsEmail, IsNotEmpty } from 'class-validator';
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
    example: 50.00,
    description: 'The amount to transfer',
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount!: number;
}
