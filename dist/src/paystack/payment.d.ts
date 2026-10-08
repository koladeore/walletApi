export interface PaystackPayment {
    reference: string;
    amountMinor: string;
    currency: string;
    domain: string;
    status: string;
    email: string;
    transactionId: string;
}
export declare function record(value: unknown): Record<string, unknown>;
export declare function parsePayment(value: unknown): PaystackPayment;
