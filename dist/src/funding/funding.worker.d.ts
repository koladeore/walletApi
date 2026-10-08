import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { WebhookService } from './webhook.service';
import { ConfirmationService } from './confirmation.service';
export declare class FundingWorker implements OnModuleInit, OnModuleDestroy {
    private readonly prisma;
    private readonly config;
    private readonly webhook;
    private readonly confirmation;
    private timer?;
    private running;
    private readonly logger;
    constructor(prisma: PrismaService, config: ConfigService, webhook: WebhookService, confirmation: ConfirmationService);
    onModuleInit(): void;
    onModuleDestroy(): void;
    tick(): Promise<void>;
}
