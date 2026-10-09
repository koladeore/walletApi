import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
export declare function lagosDay(date?: Date): string;
export declare class LimitsService {
    private readonly prisma;
    private readonly policies;
    constructor(prisma: PrismaService, config: ConfigService);
    consume(tx: Prisma.TransactionClient, userId: string, amountMinor: bigint, reference: string): Promise<void>;
    status(userId: string): Promise<{
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
