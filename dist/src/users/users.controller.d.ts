import { UsersService } from './users.service';
import type { AuthenticatedRequest } from '../common/types/authenticated-request';
export declare class UsersController {
    private readonly usersService;
    constructor(usersService: UsersService);
    getProfile(req: AuthenticatedRequest): Promise<{
        email: string;
        id: string;
        firstName: string | null;
        lastName: string | null;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
    }>;
    getWallet(req: AuthenticatedRequest): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        balance: import("@prisma/client-runtime-utils").Decimal;
        currency: string;
    }>;
}
