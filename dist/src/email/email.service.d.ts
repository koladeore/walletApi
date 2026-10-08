import { Queue } from 'bullmq';
export declare class EmailService {
    private emailQueue;
    constructor(emailQueue: Queue);
    sendWelcomeEmail(email: string, name: string): Promise<void>;
    sendTransferReceipt(email: string, amount: string, receiverEmail: string): Promise<void>;
    sendTransferReceivedEmail(email: string, amount: string, senderEmail: string): Promise<void>;
}
