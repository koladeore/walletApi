import { Module } from '@nestjs/common';
import { PaystackModule } from '../paystack/paystack.module';
import { PayoutsController } from './payouts.controller';
import { PayoutsService } from './payouts.service';
import { PayoutsWorker } from './payouts.worker';

@Module({
  imports: [PaystackModule],
  controllers: [PayoutsController],
  providers: [PayoutsService, PayoutsWorker],
  exports: [PayoutsService],
})
export class PayoutsModule {}
