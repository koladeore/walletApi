import type { AuthenticatedRequest } from '../common/types/authenticated-request';
import { FundWalletDto } from '../wallet/dto/fund-wallet.dto';
import { FundingService } from './funding.service';
export declare class FundingController {
    private readonly funding;
    constructor(funding: FundingService);
    initialize(req: AuthenticatedRequest, dto: FundWalletDto, key: string): Promise<{
        reference: string;
        amount: string;
        amountMinor: string;
        currency: string;
        status: import("@prisma/client").$Enums.FundingStatus;
        authorizationUrl: string | null;
        accessCode: string | null;
    }>;
    get(req: AuthenticatedRequest, reference: string): Promise<{
        reference: string;
        amount: string;
        amountMinor: string;
        currency: string;
        status: import("@prisma/client").$Enums.FundingStatus;
        authorizationUrl: string | null;
        accessCode: string | null;
    }>;
}
