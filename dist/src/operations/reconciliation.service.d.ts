import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OperationsProviderService } from '../paystack/operations-provider.service';
import { PaystackService } from '../paystack/paystack.service';
import { PayoutProviderService } from '../paystack/payout-provider.service';
import { FinancialService } from './financial.service';
export declare class ReconciliationService {
    private readonly prisma;
    private readonly inventory;
    private readonly paystack;
    private readonly payoutProvider;
    private readonly financial;
    constructor(prisma: PrismaService, inventory: OperationsProviderService, paystack: PaystackService, payoutProvider: PayoutProviderService, financial: FinancialService);
    run(): Promise<{
        id: string;
        summary: Prisma.JsonValue | null;
        status: string;
        startedAt: Date;
        completedAt: Date | null;
    }>;
}
