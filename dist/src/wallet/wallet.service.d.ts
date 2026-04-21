import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { TransactionHistoryQueryDto } from './dto/transaction-history-query.dto';
import { EmailService } from '../email/email.service';
import { NotificationService } from '../notification/notification.service';
export declare class WalletService {
    private readonly prisma;
    private readonly emailService;
    private readonly notificationService;
    constructor(prisma: PrismaService, emailService: EmailService, notificationService: NotificationService);
    fundWallet(userId: string, amount: number, idempotencyKey: string): Promise<{
        wallet: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            userId: string;
            balance: Prisma.Decimal;
            currency: string;
        };
        transaction: {
            type: import("@prisma/client").$Enums.TransactionType;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            metadata: Prisma.JsonValue | null;
            amount: Prisma.Decimal;
            status: import("@prisma/client").$Enums.TransactionStatus;
            referenceId: string;
            senderWalletId: string | null;
            receiverWalletId: string | null;
        };
    }>;
    transferFunds(senderId: string, receiverEmail: string, amount: number, idempotencyKey: string): Promise<{
        type: import("@prisma/client").$Enums.TransactionType;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        metadata: Prisma.JsonValue | null;
        amount: Prisma.Decimal;
        status: import("@prisma/client").$Enums.TransactionStatus;
        referenceId: string;
        senderWalletId: string | null;
        receiverWalletId: string | null;
    }>;
    getTransactionHistory(userId: string, query: TransactionHistoryQueryDto): Promise<{
        data: {
            type: import("@prisma/client").$Enums.TransactionType;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            metadata: Prisma.JsonValue | null;
            amount: Prisma.Decimal;
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
