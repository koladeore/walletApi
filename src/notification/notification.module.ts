import { SecurityModule } from '../security/security.module';
import { DeliveryController } from './delivery.controller';
import { Module } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { NotificationWorker } from './notification.worker';
@Module({
  imports: [SecurityModule],
  providers: [NotificationService, NotificationWorker],
  controllers: [NotificationController, DeliveryController],
  exports: [NotificationService],
})
export class NotificationModule {}
