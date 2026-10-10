import { CursorQueryDto } from '../common/pagination/cursor';
import type { AuthenticatedRequest } from '../common/types/authenticated-request';
import { BeneficiariesService } from './beneficiaries.service';
import { BankAccountDto } from './dto/bank-account.dto';
import { BankListQueryDto } from './dto/bank-list-query.dto';
export declare class BeneficiariesController {
    private readonly beneficiaries;
    constructor(beneficiaries: BeneficiariesService);
    banks(req: AuthenticatedRequest, query: BankListQueryDto): Promise<{
        banks: {
            name: string;
            code: string;
            active: boolean;
        }[];
        page: number;
        nextPage: number | null;
    }>;
    resolve(req: AuthenticatedRequest, dto: BankAccountDto): Promise<{
        currency: string;
        providerMode: string;
        accountNumber: string;
        bankCode: string;
        accountName: string;
    }>;
    create(req: AuthenticatedRequest, dto: BankAccountDto): Promise<{
        id: string;
        bankCode: string;
        accountNumberLast4: string;
        accountName: string;
        currency: string;
        providerMode: string;
        verifiedAt: Date;
        createdAt: Date;
    }>;
    list(req: AuthenticatedRequest, query: CursorQueryDto): Promise<{
        data: {
            id: string;
            bankCode: string;
            accountNumberLast4: string;
            accountName: string;
            currency: string;
            providerMode: string;
            verifiedAt: Date;
            createdAt: Date;
        }[];
        meta: {
            limit: number;
            hasMore: boolean;
            nextCursor: string | null;
        };
    }>;
    get(req: AuthenticatedRequest, id: string): Promise<{
        id: string;
        bankCode: string;
        accountNumberLast4: string;
        accountName: string;
        currency: string;
        providerMode: string;
        verifiedAt: Date;
        createdAt: Date;
    }>;
}
