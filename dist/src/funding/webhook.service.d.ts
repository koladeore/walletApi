import { PrismaService } from '../prisma/prisma.service';
import { PaystackService } from '../paystack/paystack.service';
import { ConfirmationService } from './confirmation.service';
import { PayoutsService } from '../payouts/payouts.service';
export declare class WebhookService {
    private readonly prisma;
    private readonly paystack;
    private readonly confirmation;
    private readonly payouts?;
    constructor(prisma: PrismaService, paystack: PaystackService, confirmation: ConfirmationService, payouts?: PayoutsService | undefined);
    receive(raw: Buffer | undefined, signature: string | undefined): Promise<{
        received: boolean;
    }>;
    process(id: string): Promise<void>;
}
