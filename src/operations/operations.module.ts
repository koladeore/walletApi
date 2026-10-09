import { Module } from '@nestjs/common';
import { PaystackModule } from '../paystack/paystack.module';
import { FinancialService } from './financial.service';
import { ReconciliationService } from './reconciliation.service';
import { OperationsController } from './operations.controller';
import { OperationsWorker } from './operations.worker';

@Module({
  imports: [PaystackModule],
  providers: [FinancialService, ReconciliationService, OperationsWorker],
  controllers: [OperationsController],
  exports: [FinancialService],
})
export class OperationsModule {}
