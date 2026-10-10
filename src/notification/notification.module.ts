import { Module } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { NotificationWorker } from './notification.worker';
@Module({
  providers: [NotificationService, NotificationWorker],
  controllers: [NotificationController],
  exports: [NotificationService],
})
export class NotificationModule {}
