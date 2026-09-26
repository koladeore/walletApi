import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, MaxLength } from 'class-validator';

export class RecipientLookupDto {
  @ApiProperty({ example: 'recipient@example.com' })
  @IsEmail()
  @MaxLength(254)
  email!: string;
}
