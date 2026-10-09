import { FinancialReasonDto } from '../common/dto/financial-reason.dto';
import { UsersService } from './users.service';
import type { AuthenticatedRequest } from '../common/types/authenticated-request';
import { RecipientLookupDto } from './dto/recipient-lookup.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
export declare class UsersController {
    private readonly usersService;
    constructor(usersService: UsersService);
    getAllUsers(): Promise<{
        email: string;
        firstName: string | null;
        lastName: string | null;
        isActive: boolean;
        id: string;
        createdAt: Date;
        updatedAt: Date;
    }[]>;
    getProfile(req: AuthenticatedRequest): Promise<{
        email: string;
        firstName: string | null;
        lastName: string | null;
        isActive: boolean;
        id: string;
        role: import("@prisma/client").$Enums.Role;
        createdAt: Date;
        updatedAt: Date;
    }>;
    getWallet(req: AuthenticatedRequest): Promise<{
        id: string;
        closedAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        balanceMinor: bigint;
        reservedMinor: bigint;
        outgoingFrozen: boolean;
        currency: string;
    } & {
        balanceMinor: string;
        balance: string;
        reservedMinor: string;
        reservedBalance: string;
        availableMinor: string;
        availableBalance: string;
    }>;
    lookupRecipient(dto: RecipientLookupDto): Promise<{
        firstName: string | null;
        lastName: string | null;
        id: string;
    }>;
    getUserById(id: string): Promise<{
        email: string;
        firstName: string | null;
        lastName: string | null;
        isActive: boolean;
        id: string;
        role: import("@prisma/client").$Enums.Role;
        createdAt: Date;
        updatedAt: Date;
    }>;
    closeAccount(req: AuthenticatedRequest, id: string, dto: FinancialReasonDto): Promise<{
        isActive: boolean;
        id: string;
        closedAt: Date | null;
    }>;
    updateStatus(req: AuthenticatedRequest, id: string, dto: UpdateUserStatusDto): Promise<{
        email: string;
        firstName: string | null;
        lastName: string | null;
        isActive: boolean;
        id: string;
        createdAt: Date;
        updatedAt: Date;
    }>;
}
