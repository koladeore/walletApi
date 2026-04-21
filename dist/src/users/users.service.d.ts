import { PrismaService } from '../prisma/prisma.service';
import { Prisma, User } from '@prisma/client';
import { EmailService } from '../email/email.service';
export declare class UsersService {
    private prisma;
    private emailService;
    constructor(prisma: PrismaService, emailService: EmailService);
    findByEmail(email: string): Promise<User | null>;
    findById(id: string): Promise<User | null>;
    getProfile(id: string): Promise<{
        email: string;
        id: string;
        firstName: string | null;
        lastName: string | null;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
    } | null>;
    getWallet(userId: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        balance: Prisma.Decimal;
        currency: string;
    } | null>;
    create(data: Prisma.UserCreateInput): Promise<User>;
}
