import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { PayoutsService } from './payouts.service';
export declare class PayoutsWorker implements OnModuleInit, OnModuleDestroy {
    private readonly prisma;
    private readonly config;
    private readonly payouts;
    private timer?;
    private running;
    private readonly logger;
    constructor(prisma: PrismaService, config: ConfigService, payouts: PayoutsService);
    onModuleInit(): void;
    onModuleDestroy(): void;
    tick(): Promise<void>;
}
