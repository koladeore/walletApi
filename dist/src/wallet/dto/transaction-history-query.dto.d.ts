import { TransactionType } from '@prisma/client';
export declare class TransactionHistoryQueryDto {
    page?: number;
    limit?: number;
    mode?: 'page' | 'cursor';
    cursor?: string;
    type?: TransactionType;
    startDate?: string;
    endDate?: string;
}
