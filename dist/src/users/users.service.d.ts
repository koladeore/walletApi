import { CursorQueryDto } from '../common/pagination/cursor';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, User } from '@prisma/client';
import { RegisterDto } from '../auth/dto/register.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
declare const userProfileSelect: {
    id: true;
    email: true;
    firstName: true;
    lastName: true;
    isActive: true;
    createdAt: true;
    updatedAt: true;
};
type PublicUser = Prisma.UserGetPayload<{
    select: typeof userProfileSelect;
}>;
export declare class UsersService {
    private prisma;
    constructor(prisma: PrismaService);
    findByEmail(email: string): Promise<User | null>;
    findById(id: string): Promise<User | null>;
    getProfile(id: string): Promise<{
        email: string;
        createdAt: Date;
        id: string;
        firstName: string | null;
        lastName: string | null;
        isActive: boolean;
        role: import("@prisma/client").$Enums.Role;
        updatedAt: Date;
    } | null>;
    getAllUsers(query?: CursorQueryDto): Promise<{
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
    getWallet(userId: string): Promise<({
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
    }) | null>;
    lookupRecipient(email: string): Promise<{
        id: string;
        firstName: string | null;
        lastName: string | null;
    } | null>;
    create(data: RegisterDto): Promise<PublicUser>;
    closeAccount(actorId: string, userId: string, reason: string, expectedAuthVersion?: number): Promise<{
        id: string;
        isActive: boolean;
        closedAt: Date | null;
    }>;
    updateStatus(actorId: string, userId: string, dto: UpdateUserStatusDto, expectedAuthVersion?: number): Promise<{
        email: string;
        createdAt: Date;
        id: string;
        firstName: string | null;
        lastName: string | null;
        isActive: boolean;
        updatedAt: Date;
    }>;
}
export {};
