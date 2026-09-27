import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';

interface TransferReceivedData {
  userId: string;
  amount: string;
  currency: 'NGN';
  senderEmail: string;
}

@Processor('notification')
export class NotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationProcessor.name);

  process(job: Job<TransferReceivedData, void, string>): Promise<void> {
    this.logger.log(`Processing notification job: ${job.name} (ID: ${job.id})`);

    try {
      if (job.data.currency !== 'NGN')
        throw new Error('Legacy notification requires currency review before replay');
      switch (job.name) {
        case 'transfer-received':
          this.logger.log(
            `[SIMULATED PUSH] User ${job.data.userId} received NGN ${job.data.amount} from ${job.data.senderEmail}`,
          );
          break;
        default:
          this.logger.warn(`Unknown job name: ${job.name}`);
      }
    } catch (error) {
      this.logger.error(`Failed to process job ${job.id}`, error);
      throw error;
    }

    return Promise.resolve();
  }
}
