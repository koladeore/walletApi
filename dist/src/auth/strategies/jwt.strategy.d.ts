import { Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from '../../users/users.service';
declare const JwtStrategy_base: new (...args: [opt: import("passport-jwt").StrategyOptionsWithRequest] | [opt: import("passport-jwt").StrategyOptionsWithoutRequest]) => Strategy & {
    validate(...args: any[]): unknown;
};
export declare class JwtStrategy extends JwtStrategy_base {
    private usersService;
    private prisma;
    constructor(configService: ConfigService, usersService: UsersService, prisma: PrismaService);
    validate(payload: {
        sub: string;
        email: string;
        authVersion?: number;
        sid?: string;
        kind?: string;
    }): Promise<{
        sessionId: string;
        createdAt: Date;
        id: string;
        email: string;
        password: string;
        firstName: string | null;
        lastName: string | null;
        isActive: boolean;
        emailVerifiedAt: Date | null;
        phone: string | null;
        phoneVerifiedAt: Date | null;
        role: import("@prisma/client").$Enums.Role;
        accountTier: string;
        authVersion: number;
        closedAt: Date | null;
        updatedAt: Date;
    }>;
}
export {};
