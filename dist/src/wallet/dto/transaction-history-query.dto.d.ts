import { TransactionType } from '@prisma/client';
export declare class TransactionHistoryQueryDto {
    page?: number;
    limit?: number;
    type?: TransactionType;
    startDate?: string;
    endDate?: string;
}
