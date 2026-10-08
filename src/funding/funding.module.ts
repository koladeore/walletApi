import { Module } from '@nestjs/common';
import { PaystackModule } from '../paystack/paystack.module';
import { FundingService } from './funding.service';
import { FundingController } from './funding.controller';

@Module({
  imports: [PaystackModule],
  providers: [FundingService],
  controllers: [FundingController],
})
export class FundingModule {}
