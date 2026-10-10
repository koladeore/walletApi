import { CursorQueryDto } from '../common/pagination/cursor';
import type { AuthenticatedRequest } from '../common/types/authenticated-request';
import { PrismaService } from '../prisma/prisma.service';
import { ReconciliationService } from './reconciliation.service';
declare class InvestigationDto {
    reason: string;
}
export declare class OperationsController {
    private readonly prisma;
    private readonly reconciliation;
    constructor(prisma: PrismaService, reconciliation: ReconciliationService);
    unfreeze(req: AuthenticatedRequest, id: string, dto: InvestigationDto): Promise<{
        walletId: string;
        outgoingFrozen: boolean;
    }>;
    run(req: AuthenticatedRequest, dto: InvestigationDto): Promise<{
        startedAt: Date;
        id: string;
        summary: import("@prisma/client/runtime/client").JsonValue | null;
        status: string;
        completedAt: Date | null;
    }>;
    runs(query: CursorQueryDto): Promise<{
        data: {
            startedAt: Date;
            id: string;
            summary: import("@prisma/client/runtime/client").JsonValue | null;
            status: string;
            completedAt: Date | null;
        }[];
        meta: {
            limit: number;
            hasMore: boolean;
            nextCursor: string | null;
        };
    }>;
    issues(query: CursorQueryDto): Promise<{
        data: {
            firstSeenAt: Date;
            id: string;
            kind: string;
            status: string;
            details: import("@prisma/client/runtime/client").JsonValue;
            key: string;
            resolvedAt: Date | null;
            resolution: string | null;
            reference: string | null;
            lastSeenAt: Date;
        }[];
        meta: {
            limit: number;
            hasMore: boolean;
            nextCursor: string | null;
        };
    }>;
    cases(query: CursorQueryDto): Promise<{
        data: {
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
        }[];
        meta: {
            limit: number;
            hasMore: boolean;
            nextCursor: string | null;
        };
    }>;
    fees(query: CursorQueryDto): Promise<{
        data: {
            amountMinor: string;
            createdAt: Date;
            id: string;
            kind: string;
            reference: string;
        }[];
        meta: {
            limit: number;
            hasMore: boolean;
            nextCursor: string | null;
        };
    }>;
    resolve(req: AuthenticatedRequest, id: string, dto: InvestigationDto): Promise<{
        firstSeenAt: Date;
        id: string;
        kind: string;
        status: string;
        details: import("@prisma/client/runtime/client").JsonValue;
        key: string;
        resolvedAt: Date | null;
        resolution: string | null;
        reference: string | null;
        lastSeenAt: Date;
    }>;
}
export {};
