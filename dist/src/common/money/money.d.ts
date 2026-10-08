export declare const MAX_MINOR = 9223372036854775807n;
export declare function parseNaira(value: unknown): bigint;
export declare function formatMinor(value: bigint): string;
export declare function walletResponse<T extends {
    balanceMinor: bigint;
    reservedMinor?: bigint;
}>(wallet: T): T & {
    balanceMinor: string;
    balance: string;
    reservedMinor: string;
    reservedBalance: string;
    availableMinor: string;
    availableBalance: string;
};
export declare function transactionResponse<T extends {
    amountMinor: bigint;
}>(transaction: T): T & {
    amountMinor: string;
    amount: string;
};
