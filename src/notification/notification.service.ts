import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class NotificationService {
  constructor(@InjectQueue('notification') private notificationQueue: Queue) {}

  async notifyTransferReceived(userId: string, amount: string, senderEmail: string) {
    await this.notificationQueue.add(
      'transfer-received',
      {
        userId,
        amount,
        currency: 'NGN',
        senderEmail,
      },
      {
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    );
  }
}
