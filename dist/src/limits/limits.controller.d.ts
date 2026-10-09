import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedRequest } from '../common/types/authenticated-request';
import { FinancialReasonDto } from '../common/dto/financial-reason.dto';
import { LimitsService } from './limits.service';
declare class TierDto extends FinancialReasonDto {
    tier: string;
}
export declare class LimitsController {
    private readonly limits;
    constructor(limits: LimitsService);
    get(req: AuthenticatedRequest): Promise<{
        tier: string;
        emailVerified: boolean;
        timezone: string;
        day: string;
        transactionLimit: string;
        dailyLimit: string;
        usedToday: string;
        remainingToday: string;
        outgoingFrozen: boolean;
    }>;
}
export declare class AdminLimitsController {
    private readonly prisma;
    constructor(prisma: PrismaService);
    private change;
    tier(req: AuthenticatedRequest, id: string, dto: TierDto): Promise<{
        userId: string;
        tier: string;
        outgoingFrozen?: undefined;
    } | {
        userId: string;
        outgoingFrozen: boolean;
        tier?: undefined;
    }>;
    freeze(req: AuthenticatedRequest, id: string, dto: FinancialReasonDto): Promise<{
        userId: string;
        tier: string;
        outgoingFrozen?: undefined;
    } | {
        userId: string;
        outgoingFrozen: boolean;
        tier?: undefined;
    }>;
    flags(): import("@prisma/client").Prisma.PrismaPromise<{
        id: string;
        createdAt: Date;
        userId: string;
        kind: string;
        status: string;
        details: import("@prisma/client/runtime/client").JsonValue;
        key: string;
        resolvedAt: Date | null;
        resolution: string | null;
    }[]>;
    resolve(req: AuthenticatedRequest, id: string, dto: FinancialReasonDto): Promise<{
        id: string;
        createdAt: Date;
        userId: string;
        kind: string;
        status: string;
        details: import("@prisma/client/runtime/client").JsonValue;
        key: string;
        resolvedAt: Date | null;
        resolution: string | null;
    }>;
}
export {};
