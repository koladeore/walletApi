import { LimitsModule } from '../limits/limits.module';
import { Module } from '@nestjs/common';
import { PaystackModule } from '../paystack/paystack.module';
import { PayoutsController } from './payouts.controller';
import { PayoutsService } from './payouts.service';
import { PayoutsWorker } from './payouts.worker';
import { SecurityModule } from '../security/security.module';

@Module({
  imports: [LimitsModule, PaystackModule, SecurityModule],
  controllers: [PayoutsController],
  providers: [PayoutsService, PayoutsWorker],
  exports: [PayoutsService],
})
export class PayoutsModule {}
