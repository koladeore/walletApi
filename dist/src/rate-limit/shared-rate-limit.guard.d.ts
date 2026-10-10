import { CanActivate, ExecutionContext, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
export declare class SharedRateLimitGuard implements CanActivate, OnModuleDestroy {
    private readonly config;
    private readonly redis;
    private readonly jwt;
    private readonly logger;
    constructor(config: ConfigService);
    onModuleDestroy(): void;
    private hash;
    canActivate(context: ExecutionContext): Promise<boolean>;
}
