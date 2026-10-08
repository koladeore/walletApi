import { Queue } from 'bullmq';
export declare class NotificationService {
    private notificationQueue;
    constructor(notificationQueue: Queue);
    notifyTransferReceived(userId: string, amount: string, senderEmail: string): Promise<void>;
}
