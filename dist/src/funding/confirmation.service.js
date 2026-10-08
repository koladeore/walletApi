"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfirmationService = void 0;
exports.matchesPayment = matchesPayment;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const paystack_service_1 = require("../paystack/paystack.service");
const money_1 = require("../common/money/money");
function matchesPayment(request, payment) {
    return (payment.reference === request.reference &&
        payment.amountMinor === request.amountMinor.toString() &&
        payment.currency === request.currency &&
        payment.domain === request.providerMode &&
        request.provider === 'PAYSTACK' &&
        (!request.providerTransactionId || payment.transactionId === request.providerTransactionId) &&
        payment.email.toLowerCase() === request.expectedEmail.toLowerCase());
}
let ConfirmationService = class ConfirmationService {
    prisma;
    paystack;
    constructor(prisma, paystack) {
        this.prisma = prisma;
        this.paystack = paystack;
    }
    async confirm(reference, userId, eventPayment) {
        const expected = await this.prisma.fundingRequest.findFirst({
            where: { reference, ...(userId ? { userId } : {}) },
        });
        if (!expected)
            throw new common_1.NotFoundException('Funding request not found');
        if (eventPayment &&
            (!matchesPayment(expected, eventPayment) || eventPayment.status !== 'success'))
            throw new common_1.ConflictException('Webhook payment does not match the funding request');
        if (expected.status === 'SUCCESS')
            return expected;
        const payment = await this.paystack.verifyPayment(reference);
        if (!matchesPayment(expected, payment))
            throw new common_1.ConflictException('Verified payment does not match the funding request');
        if (eventPayment && eventPayment.transactionId !== payment.transactionId)
            throw new common_1.ConflictException('Webhook transaction does not match the verified payment');
        return this.prisma.$transaction(async (tx) => {
            await tx.$queryRaw `SELECT id FROM funding_requests WHERE id=${expected.id} FOR UPDATE`;
            const request = await tx.fundingRequest.findUniqueOrThrow({ where: { id: expected.id } });
            if (request.status === 'SUCCESS')
                return request;
            if (!matchesPayment(request, payment))
                throw new common_1.ConflictException('Funding details changed');
            if (payment.status !== 'success') {
                return tx.fundingRequest.update({
                    where: { id: request.id },
                    data: {
                        lastCheckedAt: new Date(),
                        status: ['failed', 'abandoned', 'reversed'].includes(payment.status)
                            ? 'FAILED'
                            : 'PENDING',
                    },
                });
            }
            await tx.$queryRaw `SELECT id FROM wallets WHERE id=${request.walletId} FOR UPDATE`;
            const wallet = await tx.wallet.findUniqueOrThrow({ where: { id: request.walletId } });
            if (wallet.userId !== request.userId ||
                wallet.currency !== request.currency ||
                wallet.closedAt)
                throw new common_1.ConflictException('Wallet cannot receive this payment; payment requires reconciliation');
            if (wallet.balanceMinor + request.amountMinor > money_1.MAX_MINOR)
                throw new common_1.ConflictException('Wallet balance limit exceeded');
            const confirmed = await tx.fundingRequest.update({
                where: { id: request.id },
                data: {
                    status: 'SUCCESS',
                    providerTransactionId: payment.transactionId,
                    verifiedAt: new Date(),
                    lastCheckedAt: new Date(),
                },
            });
            await tx.transaction.create({
                data: {
                    id: `funding:${request.id}`,
                    referenceId: `paystack:${request.reference}`,
                    amountMinor: request.amountMinor,
                    currency: request.currency,
                    type: 'CREDIT',
                    status: 'SUCCESS',
                    receiverWalletId: request.walletId,
                    metadata: {
                        fundingSource: 'PAYSTACK',
                        fundingRequestId: request.id,
                        providerTransactionId: payment.transactionId,
                        providerMode: payment.domain,
                    },
                },
            });
            await tx.wallet.update({
                where: { id: wallet.id },
                data: { balanceMinor: { increment: request.amountMinor } },
            });
            return confirmed;
        }, { isolationLevel: client_1.Prisma.TransactionIsolationLevel.ReadCommitted });
    }
};
exports.ConfirmationService = ConfirmationService;
exports.ConfirmationService = ConfirmationService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        paystack_service_1.PaystackService])
], ConfirmationService);
//# sourceMappingURL=confirmation.service.js.map