import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { FundWalletDto } from '../wallet/dto/fund-wallet.dto';

export class PayoutDto extends FundWalletDto {
  @ApiProperty({ description: 'ID of your saved verified beneficiary' })
  @IsUUID()
  beneficiaryId!: string;
}
