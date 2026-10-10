import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { User } from '@prisma/client';
export declare class AuthService {
    private usersService;
    private jwtService;
    private configService;
    private prisma;
    constructor(usersService: UsersService, jwtService: JwtService, configService: ConfigService, prisma: PrismaService);
    register(dto: RegisterDto): Promise<{
        email: string;
        createdAt: Date;
        id: string;
        firstName: string | null;
        lastName: string | null;
        isActive: boolean;
        updatedAt: Date;
    }>;
    login(dto: LoginDto, userAgent?: string): Promise<{
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
    private tokens;
    generateTokens(expected: User, userAgent?: string): Promise<{
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
    private refreshPayload;
    refreshTokens(refreshToken: string): Promise<{
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
    logout(refreshToken: string): Promise<void>;
    sessions(userId: string, currentSessionId: string): Promise<{
        current: boolean;
        createdAt: Date;
        id: string;
        userAgent: string | null;
        lastUsedAt: Date;
        expiresAt: Date;
    }[]>;
    revokeSession(userId: string, sessionId: string): Promise<{
        message: string;
    }>;
    logoutAll(userId: string): Promise<{
        message: string;
    }>;
}
