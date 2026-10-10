import type { Prisma as PrismaTypes } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OperationsProviderService } from '../paystack/operations-provider.service';
export declare class FinancialService {
    private readonly prisma;
    private readonly provider;
    constructor(prisma: PrismaService, provider: OperationsProviderService);
    issue(key: string, kind: string, reference: string | null, details: PrismaTypes.InputJsonObject): Promise<void>;
    journal(tx: PrismaTypes.TransactionClient, id: string, debit: string, credit: string, amount: bigint, description: string): Promise<void>;
    fee(kind: 'FUNDING' | 'PAYOUT', reference: string, amountMinor: string | undefined): Promise<void>;
    processCase(kind: 'REFUND' | 'DISPUTE', providerId: string): Promise<{
        amountMinor: string;
        recoveredMinor: string;
        shortfallMinor: string;
        createdAt: Date;
        id: string;
        updatedAt: Date;
        kind: string;
        reference: string;
        walletId: string;
        providerId: string;
        providerStatus: string;
        nextCheckAt: Date;
        fundingId: string;
        applied: boolean;
    }>;
}
