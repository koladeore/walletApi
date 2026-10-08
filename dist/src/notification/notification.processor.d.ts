import { WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
interface TransferReceivedData {
    userId: string;
    amount: string;
    currency: 'NGN';
    senderEmail: string;
}
export declare class NotificationProcessor extends WorkerHost {
    private readonly logger;
    process(job: Job<TransferReceivedData, void, string>): Promise<void>;
}
export {};
