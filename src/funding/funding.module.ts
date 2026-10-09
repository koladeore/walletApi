import { Module } from '@nestjs/common';
import { PaystackModule } from '../paystack/paystack.module';
import { FundingService } from './funding.service';
import { FundingController } from './funding.controller';
import { ConfirmationService } from './confirmation.service';
import { WebhookService } from './webhook.service';
import { PaystackController } from './paystack.controller';
import { FundingWorker } from './funding.worker';
import { PayoutsModule } from '../payouts/payouts.module';
import { OperationsModule } from '../operations/operations.module';

@Module({
  imports: [PaystackModule, PayoutsModule, OperationsModule],
  providers: [FundingService, ConfirmationService, WebhookService, FundingWorker],
  controllers: [FundingController, PaystackController],
})
export class FundingModule {}
