import type { AuthenticatedRequest } from '../common/types/authenticated-request';
import { SecurityService } from './security.service';
import { CodeDto, ResetConfirmDto, ResetRequestDto, StepUpRequestDto } from './security.dto';
export declare class SecurityController {
    private readonly security;
    constructor(security: SecurityService);
    status(req: AuthenticatedRequest): Promise<{
        emailVerified: boolean;
        emailVerifiedAt: Date | null;
    }>;
    emailRequest(req: AuthenticatedRequest): Promise<{
        challengeId: `${string}-${string}-${string}-${string}-${string}`;
        expiresAt: Date;
    }>;
    emailConfirm(req: AuthenticatedRequest, dto: CodeDto): Promise<unknown>;
    resetRequest(dto: ResetRequestDto): Promise<{
        message: string;
    }>;
    reset(dto: ResetConfirmDto): Promise<unknown>;
    stepRequest(req: AuthenticatedRequest, dto: StepUpRequestDto): Promise<{
        challengeId: `${string}-${string}-${string}-${string}-${string}`;
        expiresAt: Date;
    }>;
    stepConfirm(req: AuthenticatedRequest, dto: CodeDto): Promise<unknown>;
}
