import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PaystackService } from './paystack.service';
import { PayoutProviderService } from './payout-provider.service';

@Module({
  imports: [ConfigModule],
  providers: [PaystackService, PayoutProviderService],
  exports: [PaystackService, PayoutProviderService],
})
export class PaystackModule {}
