import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { ReconciliationService } from './reconciliation.service';
import { FinancialService } from './financial.service';
export declare class OperationsWorker implements OnModuleInit, OnModuleDestroy {
    private readonly config;
    private readonly prisma;
    private readonly reconciliation;
    private readonly financial;
    private timer?;
    private running;
    private readonly logger;
    constructor(config: ConfigService, prisma: PrismaService, reconciliation: ReconciliationService, financial: FinancialService);
    onModuleInit(): void;
    onModuleDestroy(): void;
    tick(): Promise<void>;
}
