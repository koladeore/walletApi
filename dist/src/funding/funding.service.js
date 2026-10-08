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
exports.FundingService = void 0;
const node_crypto_1 = require("node:crypto");
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const paystack_service_1 = require("../paystack/paystack.service");
const money_1 = require("../common/money/money");
let FundingService = class FundingService {
    prisma;
    paystack;
    constructor(prisma, paystack) {
        this.prisma = prisma;
        this.paystack = paystack;
    }
    response(request) {
        return {
            reference: request.reference,
            amount: (0, money_1.formatMinor)(request.amountMinor),
            amountMinor: request.amountMinor.toString(),
            currency: request.currency,
            status: request.status,
            authorizationUrl: request.authorizationUrl,
            accessCode: request.accessCode,
        };
    }
    async get(userId, reference) {
        const request = await this.prisma.fundingRequest.findFirst({ where: { userId, reference } });
        if (!request)
            throw new common_1.NotFoundException('Funding request not found');
        return this.response(request);
    }
    async initialize(userId, amount, key) {
        if (typeof key !== 'string' || !/^[A-Za-z0-9._:-]{1,200}$/.test(key))
            throw new common_1.BadRequestException('x-idempotency-key must contain 1–200 letters, digits, dots, underscores, colons or hyphens');
        const amountMinor = (0, money_1.parseNaira)(amount);
        if (amountMinor > BigInt(Number.MAX_SAFE_INTEGER))
            throw new common_1.BadRequestException('Amount exceeds the supported provider range');
        this.paystack.assertEnabled();
        const reservation = await this.prisma.$transaction(async (tx) => {
            await tx.$queryRaw `SELECT pg_advisory_xact_lock(hashtextextended(${`funding:${userId}:${key}`}, 0))::text`;
            const existing = await tx.fundingRequest.findUnique({
                where: { userId_idempotencyKey: { userId, idempotencyKey: key } },
            });
            if (existing) {
                if (existing.amountMinor !== amountMinor || existing.currency !== 'NGN')
                    throw new common_1.ConflictException('Idempotency key was used for a different funding request');
                if (!existing.authorizationUrl)
                    throw new common_1.ConflictException({
                        message: 'Initialization is in progress or uncertain; check this reference before creating another payment',
                        reference: existing.reference,
                        status: existing.status,
                    });
                return { request: existing, created: false };
            }
            const user = await tx.user.findUnique({ where: { id: userId }, include: { wallet: true } });
            if (!user || !user.isActive || user.closedAt)
                throw new common_1.ForbiddenException('Active user required');
            if (!user.wallet)
                throw new common_1.NotFoundException('Wallet not found');
            if (user.wallet.closedAt)
                throw new common_1.ConflictException('Wallet is closed');
            if (user.wallet.currency !== 'NGN')
                throw new common_1.BadRequestException('Paystack funding currently supports NGN wallets only');
            const request = await tx.fundingRequest.create({
                data: {
                    reference: `fund-${(0, node_crypto_1.randomUUID)()}`,
                    idempotencyKey: key,
                    userId,
                    walletId: user.wallet.id,
                    expectedEmail: user.email,
                    amountMinor,
                    currency: 'NGN',
                },
            });
            return { request, created: true };
        }, { isolationLevel: client_1.Prisma.TransactionIsolationLevel.ReadCommitted });
        const { request } = reservation;
        if (!reservation.created)
            return this.response(request);
        try {
            const checkout = await this.paystack.initializePayment({
                email: request.expectedEmail,
                amountMinor: request.amountMinor,
                currency: 'NGN',
                reference: request.reference,
            });
            await this.prisma.fundingRequest.updateMany({
                where: { id: request.id, status: client_1.FundingStatus.INITIALIZING },
                data: { ...checkout, status: client_1.FundingStatus.PENDING },
            });
            return await this.get(userId, request.reference);
        }
        catch (error) {
            await this.prisma.fundingRequest.updateMany({
                where: { id: request.id, status: client_1.FundingStatus.INITIALIZING },
                data: { status: client_1.FundingStatus.INITIALIZATION_UNKNOWN },
            });
            throw error;
        }
    }
};
exports.FundingService = FundingService;
exports.FundingService = FundingService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        paystack_service_1.PaystackService])
], FundingService);
//# sourceMappingURL=funding.service.js.map