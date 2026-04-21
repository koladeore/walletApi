import { WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
export declare class EmailProcessor extends WorkerHost {
    private configService;
    private readonly logger;
    private resend;
    constructor(configService: ConfigService);
    process(job: Job<any, any, string>): Promise<any>;
    private getEmailTemplate;
    private handleWelcomeEmail;
    private handleTransferReceipt;
    private handleTransferIncoming;
}
