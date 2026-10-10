import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { CursorQueryDto } from '../common/pagination/cursor';
import { FinancialReasonDto } from '../common/dto/financial-reason.dto';
import type { AuthenticatedRequest } from '../common/types/authenticated-request';
declare class DeliveryQuery extends CursorQueryDto {
    status: string;
}
export declare class DeliveryController {
    private readonly prisma;
    private readonly config;
    constructor(prisma: PrismaService, config: ConfigService);
    list(query: DeliveryQuery): Promise<{
        data: {
            title: string;
            createdAt: Date;
            id: string;
            userId: string;
            kind: string;
            emailStatus: string;
            emailAttempts: number;
            emailBatchAttempts: number;
            emailRecoveryCount: number;
            emailLastError: string | null;
            emailFirstAttemptAt: Date | null;
            emailNextAttemptAt: Date;
            emailLockedUntil: Date | null;
        }[];
        meta: {
            limit: number;
            hasMore: boolean;
            nextCursor: string | null;
        };
    }>;
    get(id: string): Promise<{
        title: string;
        createdAt: Date;
        id: string;
        userId: string;
        kind: string;
        emailStatus: string;
        emailAttempts: number;
        emailBatchAttempts: number;
        emailRecoveryCount: number;
        emailLastError: string | null;
        emailFirstAttemptAt: Date | null;
        emailNextAttemptAt: Date;
        emailLockedUntil: Date | null;
    }>;
    retry(req: AuthenticatedRequest, id: string, dto: FinancialReasonDto): Promise<{
        title: string;
        createdAt: Date;
        id: string;
        userId: string;
        kind: string;
        emailStatus: string;
        emailAttempts: number;
        emailBatchAttempts: number;
        emailRecoveryCount: number;
        emailLastError: string | null;
        emailFirstAttemptAt: Date | null;
        emailNextAttemptAt: Date;
        emailLockedUntil: Date | null;
    }>;
}
export {};
