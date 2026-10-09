import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import type { SecurityAction } from './actions';
import { SecurityDeliveryService } from './delivery.service';
export declare class SecurityService {
    private readonly prisma;
    private readonly config;
    private readonly delivery;
    constructor(prisma: PrismaService, config: ConfigService, delivery: SecurityDeliveryService);
    private secret;
    private user;
    private hash;
    private issue;
    status(userId: string): Promise<{
        emailVerified: boolean;
        emailVerifiedAt: Date | null;
    }>;
    requestEmail(userId: string): Promise<{
        challengeId: `${string}-${string}-${string}-${string}-${string}`;
        expiresAt: Date;
    }>;
    requestReset(email: string): Promise<{
        message: string;
    }>;
    requestStepUp(userId: string, password: string, action: SecurityAction, details: Record<string, unknown>): Promise<{
        challengeId: `${string}-${string}-${string}-${string}-${string}`;
        expiresAt: Date;
    }>;
    private consume;
    confirmEmail(userId: string, id: string, code: string): Promise<unknown>;
    resetPassword(id: string, code: string, password: string): Promise<unknown>;
    confirmStepUp(userId: string, id: string, code: string): Promise<unknown>;
    authorize(userId: string, token: string | undefined, action: SecurityAction, details: Record<string, unknown>): Promise<number>;
}
