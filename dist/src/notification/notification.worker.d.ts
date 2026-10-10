import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
export declare class NotificationWorker implements OnModuleInit, OnModuleDestroy {
    private readonly prisma;
    private readonly config;
    private timer?;
    private running;
    private readonly logger;
    constructor(prisma: PrismaService, config: ConfigService);
    onModuleInit(): void;
    onModuleDestroy(): void;
    tick(): Promise<void>;
    deliver(id: string): Promise<void>;
}
