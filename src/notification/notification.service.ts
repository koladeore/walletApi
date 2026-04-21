import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class NotificationService {
  constructor(@InjectQueue('notification') private notificationQueue: Queue) {}

  async notifyTransferReceived(userId: string, amount: number, senderEmail: string) {
    await this.notificationQueue.add('transfer-received', {
      userId,
      amount,
      senderEmail,
    }, {
      attempts: 5,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
    });
  }
}
