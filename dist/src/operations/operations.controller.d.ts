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
    run(): Promise<{
        id: string;
        summary: import("@prisma/client/runtime/client").JsonValue | null;
        status: string;
        startedAt: Date;
        completedAt: Date | null;
    }>;
    runs(): import("@prisma/client").Prisma.PrismaPromise<{
        id: string;
        summary: import("@prisma/client/runtime/client").JsonValue | null;
        status: string;
        startedAt: Date;
        completedAt: Date | null;
    }[]>;
    issues(): import("@prisma/client").Prisma.PrismaPromise<{
        id: string;
        status: string;
        details: import("@prisma/client/runtime/client").JsonValue;
        key: string;
        reference: string | null;
        kind: string;
        resolution: string | null;
        firstSeenAt: Date;
        lastSeenAt: Date;
        resolvedAt: Date | null;
    }[]>;
    cases(): Promise<{
        amountMinor: string;
        recoveredMinor: string;
        shortfallMinor: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        reference: string;
        walletId: string;
        kind: string;
        providerId: string;
        providerStatus: string;
        nextCheckAt: Date;
        fundingId: string;
        applied: boolean;
    }[]>;
    fees(): Promise<{
        amountMinor: string;
        id: string;
        createdAt: Date;
        reference: string;
        kind: string;
    }[]>;
    resolve(req: AuthenticatedRequest, id: string, dto: InvestigationDto): Promise<{
        id: string;
        status: string;
        details: import("@prisma/client/runtime/client").JsonValue;
        key: string;
        reference: string | null;
        kind: string;
        resolution: string | null;
        firstSeenAt: Date;
        lastSeenAt: Date;
        resolvedAt: Date | null;
    }>;
}
export {};
