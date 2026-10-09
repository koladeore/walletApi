import { ConfigService } from '@nestjs/config';
export declare class PaystackService {
    private readonly config;
    constructor(config: ConfigService);
    assertEnabled(): void;
    private bankRequest;
    listBanks(page?: number): Promise<{
        banks: {
            name: string;
            code: string;
            active: boolean;
        }[];
        page: number;
        nextPage: number | null;
    }>;
    resolveBankAccount(accountNumber: string, bankCode: string): Promise<{
        accountNumber: string;
        bankCode: string;
        accountName: string;
    }>;
    authenticateWebhook(raw: Buffer | undefined, signature: string | undefined): boolean;
    verifyPayment(reference: string): Promise<import("./payment").PaystackPayment>;
    initializePayment(input: {
        email: string;
        amountMinor: bigint;
        currency: 'NGN';
        reference: string;
    }): Promise<{
        authorizationUrl: string;
        accessCode: string;
    }>;
    checkConnection(): Promise<void>;
}
