import { PrismaService } from '../prisma/prisma.service';
import { PaystackService } from '../paystack/paystack.service';
import { ConfirmationService } from './confirmation.service';
import { PayoutsService } from '../payouts/payouts.service';
import { FinancialService } from '../operations/financial.service';
export declare class WebhookService {
    private readonly prisma;
    private readonly paystack;
    private readonly confirmation;
    private readonly payouts?;
    private readonly financial?;
    constructor(prisma: PrismaService, paystack: PaystackService, confirmation: ConfirmationService, payouts?: PayoutsService | undefined, financial?: FinancialService | undefined);
    receive(raw: Buffer | undefined, signature: string | undefined): Promise<{
        received: boolean;
    }>;
    process(id: string): Promise<void>;
}
