import { PrismaService } from '../prisma/prisma.service';
import { Prisma, User } from '@prisma/client';
import { EmailService } from '../email/email.service';
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
    private emailService;
    constructor(prisma: PrismaService, emailService: EmailService);
    findByEmail(email: string): Promise<User | null>;
    findById(id: string): Promise<User | null>;
    getProfile(id: string): Promise<{
        email: string;
        firstName: string | null;
        lastName: string | null;
        isActive: boolean;
        id: string;
        role: import("@prisma/client").$Enums.Role;
        createdAt: Date;
        updatedAt: Date;
    } | null>;
    getAllUsers(): Promise<{
        email: string;
        firstName: string | null;
        lastName: string | null;
        isActive: boolean;
        id: string;
        createdAt: Date;
        updatedAt: Date;
    }[]>;
    getWallet(userId: string): Promise<({
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
    }) | null>;
    lookupRecipient(email: string): Promise<{
        firstName: string | null;
        lastName: string | null;
        id: string;
    } | null>;
    create(data: RegisterDto): Promise<PublicUser>;
    closeAccount(actorId: string, userId: string, reason: string, expectedAuthVersion?: number): Promise<{
        isActive: boolean;
        id: string;
        closedAt: Date | null;
    }>;
    updateStatus(actorId: string, userId: string, dto: UpdateUserStatusDto, expectedAuthVersion?: number): Promise<{
        email: string;
        firstName: string | null;
        lastName: string | null;
        isActive: boolean;
        id: string;
        createdAt: Date;
        updatedAt: Date;
    }>;
}
export {};
