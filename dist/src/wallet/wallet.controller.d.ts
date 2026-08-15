import { WalletService } from './wallet.service';
import { FundWalletDto } from './dto/fund-wallet.dto';
import { TransferDto } from './dto/transfer.dto';
import { TransactionHistoryQueryDto } from './dto/transaction-history-query.dto';
import type { AuthenticatedRequest } from '../common/types/authenticated-request';
export declare class WalletController {
    private readonly walletService;
    constructor(walletService: WalletService);
    fundWallet(req: AuthenticatedRequest, dto: FundWalletDto, idempotencyKey: string): Promise<{
        wallet: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            userId: string;
            balance: import("@prisma/client-runtime-utils").Decimal;
            currency: string;
        };
        transaction: {
            type: import("@prisma/client").$Enums.TransactionType;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            metadata: import("@prisma/client/runtime/client").JsonValue | null;
            amount: import("@prisma/client-runtime-utils").Decimal;
            status: import("@prisma/client").$Enums.TransactionStatus;
            referenceId: string;
            senderWalletId: string | null;
            receiverWalletId: string | null;
        };
    }>;
    transfer(req: AuthenticatedRequest, dto: TransferDto, idempotencyKey: string): Promise<{
        type: import("@prisma/client").$Enums.TransactionType;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        metadata: import("@prisma/client/runtime/client").JsonValue | null;
        amount: import("@prisma/client-runtime-utils").Decimal;
        status: import("@prisma/client").$Enums.TransactionStatus;
        referenceId: string;
        senderWalletId: string | null;
        receiverWalletId: string | null;
    }>;
    getTransactions(req: AuthenticatedRequest, query: TransactionHistoryQueryDto): Promise<{
        data: {
            type: import("@prisma/client").$Enums.TransactionType;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            metadata: import("@prisma/client/runtime/client").JsonValue | null;
            amount: import("@prisma/client-runtime-utils").Decimal;
            status: import("@prisma/client").$Enums.TransactionStatus;
            referenceId: string;
            senderWalletId: string | null;
            receiverWalletId: string | null;
        }[];
        meta: {
            totalItems: number;
            itemCount: number;
            itemsPerPage: number;
            totalPages: number;
            currentPage: number;
        };
    }>;
}
