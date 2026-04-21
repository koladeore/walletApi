import { Queue } from 'bullmq';
export declare class EmailService {
    private emailQueue;
    constructor(emailQueue: Queue);
    sendWelcomeEmail(email: string, name: string): Promise<void>;
    sendTransferReceipt(email: string, amount: number, receiverEmail: string): Promise<void>;
    sendTransferReceivedEmail(email: string, amount: number, senderEmail: string): Promise<void>;
}
