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
exports.PayoutsService = void 0;
exports.matchesTransfer = matchesTransfer;
const cursor_1 = require("../common/pagination/cursor");
const limits_service_1 = require("../limits/limits.service");
const node_crypto_1 = require("node:crypto");
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const paystack_service_1 = require("../paystack/paystack.service");
const payout_provider_service_1 = require("../paystack/payout-provider.service");
const money_1 = require("../common/money/money");
function matchesTransfer(payout, notice) {
    return (notice.reference === payout.reference &&
        notice.amountMinor === payout.amountMinor.toString() &&
        notice.currency === payout.currency &&
        notice.domain === payout.providerMode &&
        (!payout.transferCode || payout.transferCode === notice.transferCode));
}
let PayoutsService = class PayoutsService {
    prisma;
    paystack;
    provider;
    limits;
    constructor(prisma, paystack, provider, limits) {
        this.prisma = prisma;
        this.paystack = paystack;
        this.provider = provider;
        this.limits = limits;
    }
    response(payout) {
        return {
            id: payout.id,
            reference: payout.reference,
            beneficiaryId: payout.beneficiaryId,
            amount: (0, money_1.formatMinor)(payout.amountMinor),
            amountMinor: payout.amountMinor.toString(),
            currency: payout.currency,
            status: payout.status,
            providerStatus: payout.providerStatus,
            uncertain: payout.uncertain,
            lastError: payout.lastError,
            createdAt: payout.createdAt,
        };
    }
    async find(reference, userId) {
        const payout = await this.prisma.payout.findFirst({
            where: { reference, ...(userId ? { userId } : {}) },
        });
        if (!payout)
            throw new common_1.NotFoundException('Payout not found');
        return payout;
    }
    async get(userId, reference) {
        return this.response(await this.find(reference, userId));
    }
    async list(userId, query = new cursor_1.CursorQueryDto()) {
        const scope = `payouts:${userId}`;
        const rows = await this.prisma.payout.findMany({
            where: { AND: [{ userId }, (0, cursor_1.cursorBounds)(query.cursor, scope)] },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: query.limit + 1,
        });
        return (0, cursor_1.cursorPage)(rows, query.limit, scope, 'createdAt', (row) => this.response(row));
    }
    async create(userId, beneficiaryId, amount, key, expectedAuthVersion) {
        if (typeof key !== 'string' || !/^[A-Za-z0-9._:-]{1,200}$/.test(key))
            throw new common_1.BadRequestException('Valid x-idempotency-key required');
        const amountMinor = (0, money_1.parseNaira)(amount);
        if (amountMinor > BigInt(Number.MAX_SAFE_INTEGER))
            throw new common_1.BadRequestException('Amount exceeds provider range');
        this.paystack.assertEnabled();
        const payout = await this.prisma.$transaction(async (tx) => {
            await tx.$queryRaw `SELECT pg_advisory_xact_lock(hashtextextended(${`payout:${userId}:${key}`}, 0))::text`;
            const existing = await tx.payout.findUnique({
                where: { userId_idempotencyKey: { userId, idempotencyKey: key } },
            });
            if (existing) {
                if (existing.amountMinor !== amountMinor || existing.beneficiaryId !== beneficiaryId)
                    throw new common_1.ConflictException('Idempotency key was used for a different payout');
                return existing;
            }
            await tx.$queryRaw `SELECT id FROM users WHERE id=${userId} FOR SHARE`;
            const user = await tx.user.findUnique({ where: { id: userId }, include: { wallet: true } });
            if (!user || !user.isActive || user.closedAt)
                throw new common_1.ForbiddenException('Active user required');
            if (expectedAuthVersion !== undefined && user.authVersion !== expectedAuthVersion)
                throw new common_1.ForbiddenException('Authentication changed; repeat step-up');
            if (!user.wallet)
                throw new common_1.NotFoundException('Wallet not found');
            const beneficiary = await tx.beneficiary.findFirst({ where: { id: beneficiaryId, userId } });
            if (!beneficiary)
                throw new common_1.NotFoundException('Beneficiary not found');
            if (beneficiary.providerMode !== 'test' || beneficiary.currency !== 'NGN')
                throw new common_1.BadRequestException('Test NGN beneficiary required');
            await tx.$queryRaw `SELECT id FROM wallets WHERE id=${user.wallet.id} FOR UPDATE`;
            const wallet = await tx.wallet.findUniqueOrThrow({ where: { id: user.wallet.id } });
            if (wallet.closedAt || wallet.currency !== 'NGN')
                throw new common_1.ConflictException('Open NGN wallet required');
            if (wallet.outgoingFrozen)
                throw new common_1.ForbiddenException('Wallet outgoing money is frozen for investigation');
            if (wallet.balanceMinor - wallet.reservedMinor < amountMinor)
                throw new common_1.BadRequestException('Insufficient available balance');
            const reference = `payout-${(0, node_crypto_1.randomUUID)()}`;
            await this.limits.consume(tx, userId, amountMinor, reference);
            const reservation = await tx.withdrawalReservation.create({
                data: { reference, walletId: wallet.id, amountMinor, currency: 'NGN' },
            });
            return tx.payout.create({
                data: {
                    reference,
                    idempotencyKey: key,
                    userId,
                    walletId: wallet.id,
                    beneficiaryId,
                    reservationId: reservation.id,
                    amountMinor,
                    bankCode: beneficiary.bankCode,
                    accountNumber: beneficiary.accountNumber,
                    accountName: beneficiary.accountName,
                },
            });
        });
        if (!payout.submittedAt && payout.status === 'PENDING')
            await this.dispatch(payout.reference);
        return this.get(userId, payout.reference);
    }
    async dispatch(reference) {
        const payout = await this.find(reference);
        if (payout.submittedAt || payout.status !== 'PENDING')
            return;
        const now = new Date();
        const claimed = await this.prisma.payout.updateMany({
            where: {
                id: payout.id,
                submittedAt: null,
                status: 'PENDING',
                OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
            },
            data: { lockedUntil: new Date(now.getTime() + 120_000) },
        });
        if (!claimed.count)
            return;
        try {
            const recipientCode = payout.recipientCode ?? (await this.provider.createRecipient(payout));
            const submit = await this.prisma.$transaction(async (tx) => {
                await tx.$queryRaw `SELECT id FROM payouts WHERE id=${payout.id} FOR UPDATE`;
                await tx.$queryRaw `SELECT id FROM wallets WHERE id=${payout.walletId} FOR UPDATE`;
                const wallet = await tx.wallet.findUniqueOrThrow({ where: { id: payout.walletId } });
                if (wallet.outgoingFrozen || wallet.closedAt)
                    throw new common_1.ForbiddenException('Wallet outgoing money is frozen for investigation');
                return tx.payout.updateMany({
                    where: { id: payout.id, submittedAt: null, status: 'PENDING' },
                    data: { recipientCode, submittedAt: new Date(), status: 'PROCESSING', uncertain: true },
                });
            });
            if (!submit.count)
                return;
            const notice = await this.provider.initiate({
                reference: payout.reference,
                amountMinor: payout.amountMinor,
                recipientCode,
            });
            if (!matchesTransfer(payout, notice))
                throw new common_1.ConflictException('Payout submission response mismatch');
            await this.prisma.payout.updateMany({
                where: { id: payout.id, status: 'PROCESSING', transferCode: null },
                data: { transferCode: notice.transferCode, providerStatus: notice.status },
            });
            await this.verify(reference);
        }
        catch {
            await this.prisma.payout.updateMany({
                where: { id: payout.id, status: { in: ['PENDING', 'PROCESSING'] } },
                data: {
                    uncertain: true,
                    lastError: 'Provider outcome requires verification; funds remain reserved',
                    nextCheckAt: new Date(Date.now() + 60_000),
                },
            });
        }
        finally {
            await this.prisma.payout.updateMany({
                where: { id: payout.id },
                data: { lockedUntil: null },
            });
        }
    }
    async verify(reference, userId, event) {
        const expected = await this.find(reference, userId);
        if (event && !matchesTransfer(expected, event))
            throw new common_1.ConflictException('Payout webhook mismatch');
        if (expected.status === 'REVERSED')
            return this.response(expected);
        if (!expected.submittedAt || !expected.recipientCode)
            return this.response(expected);
        try {
            const verified = await this.provider.verify(reference);
            if (!matchesTransfer(expected, verified) ||
                verified.recipientCode !== expected.recipientCode ||
                verified.accountNumber !== expected.accountNumber ||
                verified.bankCode !== expected.bankCode ||
                (event && verified.transferCode !== event.transferCode))
                throw new common_1.ConflictException('Verified payout details do not match');
            return this.response(await this.apply(expected.id, verified));
        }
        catch (error) {
            await this.prisma.payout.updateMany({
                where: { id: expected.id, status: { not: 'REVERSED' } },
                data: {
                    uncertain: true,
                    lastError: 'Verification unavailable or conflicting; funds require reconciliation',
                    nextCheckAt: new Date(Date.now() + 60_000),
                },
            });
            throw error;
        }
    }
    async apply(id, verified) {
        return this.prisma.$transaction(async (tx) => {
            await tx.$queryRaw `SELECT id FROM payouts WHERE id=${id} FOR UPDATE`;
            const payout = await tx.payout.findUniqueOrThrow({ where: { id } });
            if (!matchesTransfer(payout, verified))
                throw new common_1.ConflictException('Payout identity changed');
            if (payout.status === 'REVERSED')
                return payout;
            if (payout.status === 'FAILED') {
                if (verified.status !== 'failed')
                    throw new common_1.ConflictException('Provider changed a released payout; investigate before moving funds');
                return payout;
            }
            if (payout.status === 'SUCCESS' && verified.status !== 'reversed')
                return payout;
            await tx.$queryRaw `SELECT id FROM wallets WHERE id=${payout.walletId} FOR UPDATE`;
            const reservation = await tx.withdrawalReservation.findUniqueOrThrow({
                where: { id: payout.reservationId },
            });
            const common = {
                transferCode: verified.transferCode,
                providerStatus: verified.status,
                uncertain: false,
                lastError: null,
                nextCheckAt: new Date(Date.now() + (verified.status === 'success' ? 3600_000 : 60_000)),
            };
            if (verified.status === 'success') {
                if (reservation.status !== 'PENDING')
                    throw new common_1.ConflictException('Payout reservation already resolved');
                await tx.withdrawalReservation.update({
                    where: { id: reservation.id },
                    data: { status: 'CAPTURED' },
                });
                return tx.payout.update({ where: { id }, data: { ...common, status: 'SUCCESS' } });
            }
            if (verified.status === 'failed' || verified.status === 'reversed') {
                if (reservation.status === 'PENDING') {
                    await tx.withdrawalReservation.update({
                        where: { id: reservation.id },
                        data: { status: 'RELEASED' },
                    });
                }
                else if (verified.status === 'reversed' && reservation.status === 'CAPTURED') {
                    const wallet = await tx.wallet.findUniqueOrThrow({ where: { id: payout.walletId } });
                    if (wallet.closedAt || wallet.balanceMinor + payout.amountMinor > money_1.MAX_MINOR)
                        throw new common_1.ConflictException('Reversal requires manual reconciliation');
                    await tx.payout.update({ where: { id }, data: { ...common, status: 'REVERSED' } });
                    await tx.transaction.create({
                        data: {
                            id: `payout-reversal:${id}`,
                            referenceId: `payout-reversal:${payout.reference}`,
                            reversalOfId: `withdrawal:${reservation.id}`,
                            amountMinor: payout.amountMinor,
                            currency: payout.currency,
                            type: 'CREDIT',
                            status: 'SUCCESS',
                            receiverWalletId: payout.walletId,
                            metadata: { payoutId: id, providerTransferCode: verified.transferCode },
                        },
                    });
                    await tx.wallet.update({
                        where: { id: payout.walletId },
                        data: { balanceMinor: { increment: payout.amountMinor } },
                    });
                }
                else
                    throw new common_1.ConflictException('Payout reservation outcome conflicts');
                return tx.payout.update({
                    where: { id },
                    data: { ...common, status: verified.status === 'failed' ? 'FAILED' : 'REVERSED' },
                });
            }
            return tx.payout.update({
                where: { id },
                data: {
                    ...common,
                    status: 'PROCESSING',
                    uncertain: !['pending', 'processing', 'ongoing', 'queued', 'received', 'otp'].includes(verified.status),
                    lastError: verified.status === 'otp'
                        ? 'Provider OTP authorization is required; funds remain reserved'
                        : ['pending', 'processing', 'ongoing', 'queued', 'received'].includes(verified.status)
                            ? null
                            : 'Unrecognized provider outcome; funds remain reserved for reconciliation',
                },
            });
        });
    }
};
exports.PayoutsService = PayoutsService;
exports.PayoutsService = PayoutsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        paystack_service_1.PaystackService,
        payout_provider_service_1.PayoutProviderService,
        limits_service_1.LimitsService])
], PayoutsService);
//# sourceMappingURL=payouts.service.js.map