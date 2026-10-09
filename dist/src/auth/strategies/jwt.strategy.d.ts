import { Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service';
declare const JwtStrategy_base: new (...args: [opt: import("passport-jwt").StrategyOptionsWithRequest] | [opt: import("passport-jwt").StrategyOptionsWithoutRequest]) => Strategy & {
    validate(...args: any[]): unknown;
};
export declare class JwtStrategy extends JwtStrategy_base {
    private usersService;
    constructor(configService: ConfigService, usersService: UsersService);
    validate(payload: {
        sub: string;
        email: string;
        authVersion?: number;
    }): Promise<{
        email: string;
        password: string;
        firstName: string | null;
        lastName: string | null;
        isActive: boolean;
        id: string;
        emailVerifiedAt: Date | null;
        phone: string | null;
        phoneVerifiedAt: Date | null;
        role: import("@prisma/client").$Enums.Role;
        authVersion: number;
        closedAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
}
export {};
