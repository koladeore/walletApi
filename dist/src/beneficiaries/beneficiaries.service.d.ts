import { PrismaService } from '../prisma/prisma.service';
import { PaystackService } from '../paystack/paystack.service';
import { BankAccountDto } from './dto/bank-account.dto';
export declare class BeneficiariesService {
    private readonly prisma;
    private readonly paystack;
    constructor(prisma: PrismaService, paystack: PaystackService);
    private activeUser;
    private validate;
    private response;
    banks(userId: string, page: number): Promise<{
        banks: {
            name: string;
            code: string;
            active: boolean;
        }[];
        page: number;
        nextPage: number | null;
    }>;
    resolve(userId: string, input: BankAccountDto): Promise<{
        currency: string;
        providerMode: string;
        accountNumber: string;
        bankCode: string;
        accountName: string;
    }>;
    create(userId: string, input: BankAccountDto): Promise<{
        id: string;
        bankCode: string;
        accountNumberLast4: string;
        accountName: string;
        currency: string;
        providerMode: string;
        verifiedAt: Date;
        createdAt: Date;
    }>;
    list(userId: string): Promise<{
        id: string;
        bankCode: string;
        accountNumberLast4: string;
        accountName: string;
        currency: string;
        providerMode: string;
        verifiedAt: Date;
        createdAt: Date;
    }[]>;
    get(userId: string, id: string): Promise<{
        id: string;
        bankCode: string;
        accountNumberLast4: string;
        accountName: string;
        currency: string;
        providerMode: string;
        verifiedAt: Date;
        createdAt: Date;
    }>;
}
