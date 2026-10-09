import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PaystackService } from './paystack.service';
import { PayoutProviderService } from './payout-provider.service';
import { OperationsProviderService } from './operations-provider.service';

@Module({
  imports: [ConfigModule],
  providers: [PaystackService, PayoutProviderService, OperationsProviderService],
  exports: [PaystackService, PayoutProviderService, OperationsProviderService],
})
export class PaystackModule {}
