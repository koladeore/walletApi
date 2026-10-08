import { PrismaService } from '../prisma/prisma.service';
import { PaystackService } from '../paystack/paystack.service';
import { ConfirmationService } from './confirmation.service';
export declare class WebhookService {
    private readonly prisma;
    private readonly paystack;
    private readonly confirmation;
    constructor(prisma: PrismaService, paystack: PaystackService, confirmation: ConfirmationService);
    receive(raw: Buffer | undefined, signature: string | undefined): Promise<{
        received: boolean;
    }>;
    process(id: string): Promise<void>;
}
