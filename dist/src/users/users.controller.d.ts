import { CursorQueryDto } from '../common/pagination/cursor';
import { FinancialReasonDto } from '../common/dto/financial-reason.dto';
import { UsersService } from './users.service';
import type { AuthenticatedRequest } from '../common/types/authenticated-request';
import { RecipientLookupDto } from './dto/recipient-lookup.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
export declare class UsersController {
    private readonly usersService;
    constructor(usersService: UsersService);
    getAllUsers(query: CursorQueryDto): Promise<{
        data: {
            email: string;
            createdAt: Date;
            id: string;
            firstName: string | null;
            lastName: string | null;
            isActive: boolean;
            updatedAt: Date;
        }[];
        meta: {
            limit: number;
            hasMore: boolean;
            nextCursor: string | null;
        };
    }>;
    getProfile(req: AuthenticatedRequest): Promise<{
        email: string;
        createdAt: Date;
        id: string;
        firstName: string | null;
        lastName: string | null;
        isActive: boolean;
        role: import("@prisma/client").$Enums.Role;
        updatedAt: Date;
    }>;
    getWallet(req: AuthenticatedRequest): Promise<{
        createdAt: Date;
        id: string;
        closedAt: Date | null;
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
        id: string;
        firstName: string | null;
        lastName: string | null;
    }>;
    getUserById(id: string): Promise<{
        email: string;
        createdAt: Date;
        id: string;
        firstName: string | null;
        lastName: string | null;
        isActive: boolean;
        role: import("@prisma/client").$Enums.Role;
        updatedAt: Date;
    }>;
    deleteUser(req: AuthenticatedRequest, id: string, dto: FinancialReasonDto): Promise<{
        id: string;
        isActive: boolean;
        closedAt: Date | null;
    }>;
    closeAccount(req: AuthenticatedRequest, id: string, dto: FinancialReasonDto): Promise<{
        id: string;
        isActive: boolean;
        closedAt: Date | null;
    }>;
    updateStatus(req: AuthenticatedRequest, id: string, dto: UpdateUserStatusDto): Promise<{
        email: string;
        createdAt: Date;
        id: string;
        firstName: string | null;
        lastName: string | null;
        isActive: boolean;
        updatedAt: Date;
    }>;
}
