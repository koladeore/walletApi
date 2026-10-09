import { ConfigService } from '@nestjs/config';
import { PaystackService } from './paystack.service';
export declare class PayoutProviderService {
    private readonly config;
    private readonly paystack;
    constructor(config: ConfigService, paystack: PaystackService);
    private request;
    createRecipient(input: {
        accountName: string;
        accountNumber: string;
        bankCode: string;
    }): Promise<string>;
    initiate(input: {
        reference: string;
        amountMinor: bigint;
        recipientCode: string;
    }): Promise<import("./transfer").TransferNotice>;
    verify(reference: string): Promise<import("./transfer").VerifiedTransfer>;
}
