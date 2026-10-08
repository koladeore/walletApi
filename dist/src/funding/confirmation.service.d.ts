import type { FundingRequest } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaystackService } from '../paystack/paystack.service';
import type { PaystackPayment } from '../paystack/payment';
export declare function matchesPayment(request: FundingRequest, payment: PaystackPayment): boolean;
export declare class ConfirmationService {
    private readonly prisma;
    private readonly paystack;
    constructor(prisma: PrismaService, paystack: PaystackService);
    confirm(reference: string, userId?: string, eventPayment?: PaystackPayment): Promise<FundingRequest>;
}
