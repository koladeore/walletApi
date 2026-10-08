import { PrismaService } from '../prisma/prisma.service';
import { PaystackService } from '../paystack/paystack.service';
export declare class FundingService {
    private readonly prisma;
    private readonly paystack;
    constructor(prisma: PrismaService, paystack: PaystackService);
    private response;
    get(userId: string, reference: string): Promise<{
        reference: string;
        amount: string;
        amountMinor: string;
        currency: string;
        status: import("@prisma/client").$Enums.FundingStatus;
        authorizationUrl: string | null;
        accessCode: string | null;
    }>;
    initialize(userId: string, amount: string, key: string): Promise<{
        reference: string;
        amount: string;
        amountMinor: string;
        currency: string;
        status: import("@prisma/client").$Enums.FundingStatus;
        authorizationUrl: string | null;
        accessCode: string | null;
    }>;
}
