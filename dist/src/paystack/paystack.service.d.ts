import { ConfigService } from '@nestjs/config';
export declare class PaystackService {
    private readonly config;
    constructor(config: ConfigService);
    assertEnabled(): void;
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
