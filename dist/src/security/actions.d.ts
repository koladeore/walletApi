export type SecurityAction = 'TRANSFER' | 'PAYOUT' | 'BENEFICIARY' | 'ADMIN';
export declare function describeAction(action: SecurityAction, details: Record<string, unknown>): {
    binding: string;
    summary: string;
};
