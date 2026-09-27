import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class EmailService {
  constructor(@InjectQueue('email') private emailQueue: Queue) {}

  async sendWelcomeEmail(email: string, name: string) {
    await this.emailQueue.add(
      'welcome-email',
      {
        email,
        name,
      },
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
      },
    );
  }

  async sendTransferReceipt(email: string, amount: string, receiverEmail: string) {
    await this.emailQueue.add(
      'transfer-receipt',
      {
        email,
        amount,
        currency: 'NGN',
        receiverEmail,
      },
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
      },
    );
  }

  async sendTransferReceivedEmail(email: string, amount: string, senderEmail: string) {
    await this.emailQueue.add(
      'transfer-incoming',
      {
        email,
        amount,
        currency: 'NGN',
        senderEmail,
      },
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
      },
    );
  }
}
