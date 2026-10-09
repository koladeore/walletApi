export interface TransferNotice {
    reference: string;
    amountMinor: string;
    currency: string;
    domain: string;
    status: string;
    transferCode: string;
}
export interface VerifiedTransfer extends TransferNotice {
    feeMinor?: string;
    recipientCode: string;
    bankCode: string;
    accountNumber: string;
}
export declare function parseTransferNotice(value: unknown): TransferNotice;
export declare function parseVerifiedTransfer(value: unknown): VerifiedTransfer;
