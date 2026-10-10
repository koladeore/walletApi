import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import type { AuthenticatedRequest } from '../common/types/authenticated-request';
export declare class AuthController {
    private authService;
    constructor(authService: AuthService);
    register(dto: RegisterDto): Promise<{
        createdAt: Date;
        id: string;
        email: string;
        firstName: string | null;
        lastName: string | null;
        isActive: boolean;
        updatedAt: Date;
    }>;
    login(dto: LoginDto, req: AuthenticatedRequest): Promise<{
        accessToken: string;
        refreshToken: string;
        sessionId: string;
        sessionExpiresAt: Date;
        user: {
            id: string;
            email: string;
            firstName: string | null;
            lastName: string | null;
            role: import("@prisma/client").$Enums.Role;
        };
    }>;
    refresh(dto: RefreshTokenDto): Promise<{
        accessToken: string;
        refreshToken: string;
        sessionId: string;
        sessionExpiresAt: Date;
        user: {
            id: string;
            email: string;
            firstName: string | null;
            lastName: string | null;
            role: import("@prisma/client").$Enums.Role;
        };
    }>;
    logout(dto: RefreshTokenDto): Promise<{
        message: string;
    }>;
    sessions(req: AuthenticatedRequest): Promise<{
        current: boolean;
        createdAt: Date;
        id: string;
        userAgent: string | null;
        lastUsedAt: Date;
        expiresAt: Date;
    }[]>;
    revoke(req: AuthenticatedRequest, id: string): Promise<{
        message: string;
    }>;
    logoutAll(req: AuthenticatedRequest): Promise<{
        message: string;
    }>;
}
