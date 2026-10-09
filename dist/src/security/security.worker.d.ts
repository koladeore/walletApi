import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { SecurityDeliveryService } from './delivery.service';
export declare class SecurityWorker implements OnModuleInit, OnModuleDestroy {
    private readonly prisma;
    private readonly config;
    private readonly delivery;
    private timer?;
    private running;
    private readonly logger;
    constructor(prisma: PrismaService, config: ConfigService, delivery: SecurityDeliveryService);
    onModuleInit(): void;
    onModuleDestroy(): void;
    tick(): Promise<void>;
}
