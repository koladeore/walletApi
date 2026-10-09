import { ConfigService } from '@nestjs/config';
import { PaystackService } from './paystack.service';
import type { PaystackPayment } from './payment';
export declare function providerId(value: unknown): string;
export declare function providerMinor(value: unknown): bigint;
export interface VerifiedCase {
    kind: 'REFUND' | 'DISPUTE';
    providerId: string;
    transaction: PaystackPayment;
    amountMinor: bigint;
    status: string;
    resolution: string | null;
    disputeId: string | null;
}
export declare class OperationsProviderService {
    private readonly config;
    private readonly paystack;
    constructor(config: ConfigService, paystack: PaystackService);
    private request;
    fetchCase(kind: 'REFUND' | 'DISPUTE', id: string): Promise<VerifiedCase>;
    inventory(resource: 'transaction' | 'transfer' | 'refund' | 'dispute'): Promise<Record<string, unknown>[]>;
    balance(): Promise<bigint>;
}
