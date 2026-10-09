import { Module } from '@nestjs/common';
import { PaystackModule } from '../paystack/paystack.module';
import { FinancialService } from './financial.service';
import { ReconciliationService } from './reconciliation.service';
import { OperationsController } from './operations.controller';
import { OperationsWorker } from './operations.worker';
import { SecurityModule } from '../security/security.module';

@Module({
  imports: [PaystackModule, SecurityModule],
  providers: [FinancialService, ReconciliationService, OperationsWorker],
  controllers: [OperationsController],
  exports: [FinancialService],
})
export class OperationsModule {}
