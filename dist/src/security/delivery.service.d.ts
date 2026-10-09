import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
export declare class SecurityDeliveryService {
    private readonly config;
    private readonly prisma;
    constructor(config: ConfigService, prisma: PrismaService);
    assertAvailable(channel: 'EMAIL'): void;
    process(id: string): Promise<void>;
}
