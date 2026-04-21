import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';

@Processor('notification')
export class NotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationProcessor.name);

  async process(job: Job<any, any, string>): Promise<any> {
    this.logger.log(`Processing notification job: ${job.name} (ID: ${job.id})`);
    
    try {
      switch (job.name) {
        case 'transfer-received':
          this.logger.log(`[SIMULATED PUSH] User ${job.data.userId} received $${job.data.amount} from ${job.data.senderEmail}`);
          break;
        default:
          this.logger.warn(`Unknown job name: ${job.name}`);
      }
    } catch (error) {
      this.logger.error(`Failed to process job ${job.id}`, error);
      throw error;
    }
  }
}
