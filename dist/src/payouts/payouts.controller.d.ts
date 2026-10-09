import type { AuthenticatedRequest } from '../common/types/authenticated-request';
import { PayoutDto } from './payout.dto';
import { PayoutsService } from './payouts.service';
export declare class PayoutsController {
    private readonly payouts;
    constructor(payouts: PayoutsService);
    create(req: AuthenticatedRequest, dto: PayoutDto, key: string): Promise<{
        id: string;
        reference: string;
        beneficiaryId: string;
        amount: string;
        amountMinor: string;
        currency: string;
        status: import("@prisma/client").$Enums.PayoutStatus;
        providerStatus: string | null;
        uncertain: boolean;
        lastError: string | null;
        createdAt: Date;
    }>;
    list(req: AuthenticatedRequest): Promise<{
        id: string;
        reference: string;
        beneficiaryId: string;
        amount: string;
        amountMinor: string;
        currency: string;
        status: import("@prisma/client").$Enums.PayoutStatus;
        providerStatus: string | null;
        uncertain: boolean;
        lastError: string | null;
        createdAt: Date;
    }[]>;
    get(req: AuthenticatedRequest, reference: string): Promise<{
        id: string;
        reference: string;
        beneficiaryId: string;
        amount: string;
        amountMinor: string;
        currency: string;
        status: import("@prisma/client").$Enums.PayoutStatus;
        providerStatus: string | null;
        uncertain: boolean;
        lastError: string | null;
        createdAt: Date;
    }>;
    verify(req: AuthenticatedRequest, reference: string): Promise<{
        id: string;
        reference: string;
        beneficiaryId: string;
        amount: string;
        amountMinor: string;
        currency: string;
        status: import("@prisma/client").$Enums.PayoutStatus;
        providerStatus: string | null;
        uncertain: boolean;
        lastError: string | null;
        createdAt: Date;
    }>;
}
