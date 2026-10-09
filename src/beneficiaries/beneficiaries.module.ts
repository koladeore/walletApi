import { Module } from '@nestjs/common';
import { PaystackModule } from '../paystack/paystack.module';
import { BeneficiariesService } from './beneficiaries.service';
import { BeneficiariesController } from './beneficiaries.controller';
import { SecurityModule } from '../security/security.module';

@Module({
  imports: [PaystackModule, SecurityModule],
  providers: [BeneficiariesService],
  controllers: [BeneficiariesController],
  exports: [BeneficiariesService],
})
export class BeneficiariesModule {}
