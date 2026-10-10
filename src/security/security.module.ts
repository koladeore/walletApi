import { workersEnabled } from '../config/runtime-mode';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SecurityService } from './security.service';
import { SecurityDeliveryService } from './delivery.service';
import { SecurityController } from './security.controller';
import { SecurityWorker } from './security.worker';
import { StepUpGuard } from './step-up.guard';

@Module({
  imports: [ConfigModule],
  providers: [
    SecurityService,
    SecurityDeliveryService,
    StepUpGuard,
    ...(workersEnabled() ? [SecurityWorker] : []),
  ],
  controllers: [SecurityController],
  exports: [SecurityService, StepUpGuard],
})
export class SecurityModule {}
