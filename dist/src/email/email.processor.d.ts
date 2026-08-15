import { WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
interface WelcomeEmailData {
    email: string;
    name: string;
}
interface TransferReceiptData {
    email: string;
    amount: number;
    receiverEmail: string;
}
interface TransferIncomingData {
    email: string;
    amount: number;
    senderEmail: string;
}
type EmailJobData = WelcomeEmailData | TransferReceiptData | TransferIncomingData;
export declare class EmailProcessor extends WorkerHost {
    private configService;
    private readonly logger;
    private resend;
    constructor(configService: ConfigService);
    process(job: Job<EmailJobData, void, string>): Promise<void>;
    private getEmailTemplate;
    private handleWelcomeEmail;
    private handleTransferReceipt;
    private handleTransferIncoming;
}
export {};
