import { ConfigService } from '@nestjs/config';
export declare class PaystackService {
    private readonly config;
    constructor(config: ConfigService);
    assertEnabled(): void;
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
