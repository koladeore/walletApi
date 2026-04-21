import { Queue } from 'bullmq';
export declare class NotificationService {
    private notificationQueue;
    constructor(notificationQueue: Queue);
    notifyTransferReceived(userId: string, amount: number, senderEmail: string): Promise<void>;
}
