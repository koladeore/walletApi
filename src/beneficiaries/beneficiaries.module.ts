import { Module } from '@nestjs/common';
import { PaystackModule } from '../paystack/paystack.module';
import { BeneficiariesService } from './beneficiaries.service';
import { BeneficiariesController } from './beneficiaries.controller';

@Module({
  imports: [PaystackModule],
  providers: [BeneficiariesService],
  controllers: [BeneficiariesController],
  exports: [BeneficiariesService],
})
export class BeneficiariesModule {}
