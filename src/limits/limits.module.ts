import { Module } from '@nestjs/common';
import { SecurityModule } from '../security/security.module';
import { LimitsService } from './limits.service';
import { LimitsController, AdminLimitsController } from './limits.controller';
@Module({
  imports: [SecurityModule],
  providers: [LimitsService],
  controllers: [LimitsController, AdminLimitsController],
  exports: [LimitsService],
})
export class LimitsModule {}
