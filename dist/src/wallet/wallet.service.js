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
exports.WalletService = void 0;
const node_crypto_1 = require("node:crypto");
const money_1 = require("../common/money/money");
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const prisma_service_1 = require("../prisma/prisma.service");
const client_1 = require("@prisma/client");
const email_service_1 = require("../email/email.service");
const notification_service_1 = require("../notification/notification.service");
let WalletService = class WalletService {
    prisma;
    emailService;
    notificationService;
    configService;
    constructor(prisma, emailService, notificationService, configService) {
        this.prisma = prisma;
        this.emailService = emailService;
        this.notificationService = notificationService;
        this.configService = configService;
    }
    validateKey(key) {
        if (typeof key !== 'string' || !/^[A-Za-z0-9._:-]{1,200}$/.test(key))
            throw new common_1.BadRequestException('Idempotency key must contain 1–200 letters, digits, dots, underscores, colons or hyphens');
    }
    async idempotent(key, request, perform) {
        this.validateKey(key);
        const fingerprint = (0, node_crypto_1.createHash)('sha256').update(JSON.stringify(request)).digest('hex');
        return this.prisma.$transaction(async (tx) => {
            await tx.$queryRaw `SELECT pg_advisory_xact_lock(hashtextextended(${`wallet-request:${key}`}, 0))::text`;
            const saved = await tx.walletRequest.findUnique({ where: { key } });
            if (saved) {
                if (saved.fingerprint !== fingerprint)
                    throw new common_1.ConflictException('Idempotency key was used for a different request');
                return { value: saved.response, replayed: true };
            }
            if (await tx.transaction.findUnique({ where: { referenceId: key } }))
                throw new common_1.ConflictException('This reference already exists; check transaction history');
            const value = JSON.parse(JSON.stringify(await perform(tx)));
            await tx.walletRequest.create({
                data: { key, fingerprint, response: value },
            });
            return { value, replayed: false };
        }, { isolationLevel: client_1.Prisma.TransactionIsolationLevel.ReadCommitted });
    }
    async fundWallet(userId, amount, idempotencyKey) {
        const environment = this.configService.get('NODE_ENV');
        const simulationEnabled = this.configService.get('ENABLE_SIMULATED_FUNDING') === 'true';
        if (!simulationEnabled || (environment !== 'development' && environment !== 'test')) {
            throw new common_1.ForbiddenException('Simulated wallet funding is disabled');
        }
        const amountMinor = (0, money_1.parseNaira)(amount);
        try {
            const result = await this.idempotent(idempotencyKey, ['fund', userId, 'NGN', amountMinor.toString()], async (tx) => {
                const wallet = await tx.wallet.findUnique({
                    where: { userId },
                });
                if (!wallet) {
                    throw new common_1.NotFoundException('Wallet not found');
                }
                await tx.$queryRaw `SELECT id FROM wallets WHERE id = ${wallet.id} FOR UPDATE`;
                const current = await tx.wallet.findUniqueOrThrow({ where: { id: wallet.id } });
                if (current.closedAt)
                    throw new common_1.ConflictException('Wallet is closed');
                if (current.currency !== 'NGN')
                    throw new common_1.BadRequestException('Only NGN wallets are supported');
                if (current.balanceMinor + amountMinor > money_1.MAX_MINOR)
                    throw new common_1.BadRequestException('Wallet balance limit exceeded');
                const transaction = await tx.transaction.create({
                    data: {
                        amountMinor,
                        currency: 'NGN',
                        type: 'CREDIT',
                        status: 'SUCCESS',
                        referenceId: idempotencyKey,
                        receiverWalletId: wallet.id,
                        metadata: { description: 'Wallet Funding', fundingSource: 'SIMULATION' },
                    },
                });
                const updatedWallet = await tx.wallet.update({
                    where: { id: wallet.id },
                    data: {
                        balanceMinor: {
                            increment: amountMinor,
                        },
                    },
                });
                return {
                    wallet: (0, money_1.walletResponse)(updatedWallet),
                    transaction: (0, money_1.transactionResponse)(transaction),
                };
            });
            return result.value;
        }
        catch (error) {
            if (error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
                throw new common_1.ConflictException('A transaction with this idempotency key has already been processed');
            }
            throw error;
        }
    }
    async transferFunds(senderId, receiverEmail, amount, idempotencyKey) {
        const amountMinor = (0, money_1.parseNaira)(amount);
        try {
            const execution = await this.idempotent(idempotencyKey, ['transfer', senderId, receiverEmail, 'NGN', amountMinor.toString()], async (tx) => {
                const sender = await tx.user.findUnique({
                    where: { id: senderId },
                    include: { wallet: true },
                });
                if (!sender || !sender.wallet) {
                    throw new common_1.NotFoundException('Sender wallet not found');
                }
                const receiver = await tx.user.findUnique({
                    where: { email: receiverEmail },
                    include: { wallet: true },
                });
                if (!receiver || !receiver.wallet) {
                    throw new common_1.NotFoundException('Receiver wallet not found for the provided email');
                }
                if (sender.id === receiver.id) {
                    throw new common_1.BadRequestException('Cannot transfer funds to yourself');
                }
                const senderWallet = sender.wallet;
                const receiverWallet = receiver.wallet;
                if (senderWallet.currency !== 'NGN' || receiverWallet.currency !== 'NGN') {
                    throw new common_1.BadRequestException('Both wallets must use NGN');
                }
                const firstLockId = senderWallet.id < receiverWallet.id ? senderWallet.id : receiverWallet.id;
                const secondLockId = senderWallet.id < receiverWallet.id ? receiverWallet.id : senderWallet.id;
                await tx.$queryRaw `SELECT id FROM wallets WHERE id = ${firstLockId} FOR UPDATE`;
                await tx.$queryRaw `SELECT id FROM wallets WHERE id = ${secondLockId} FOR UPDATE`;
                const freshSenderWallet = await tx.wallet.findUnique({ where: { id: senderWallet.id } });
                if (!freshSenderWallet ||
                    freshSenderWallet.balanceMinor - freshSenderWallet.reservedMinor < amountMinor) {
                    throw new common_1.BadRequestException('Insufficient balance');
                }
                const freshReceiver = await tx.wallet.findUniqueOrThrow({
                    where: { id: receiverWallet.id },
                });
                if (freshSenderWallet.closedAt || freshReceiver.closedAt)
                    throw new common_1.ConflictException('Wallet is closed');
                if (freshSenderWallet.currency !== 'NGN' || freshReceiver.currency !== 'NGN') {
                    throw new common_1.BadRequestException('Both wallets must use NGN');
                }
                if (freshReceiver.balanceMinor + amountMinor > money_1.MAX_MINOR)
                    throw new common_1.BadRequestException('Recipient balance limit exceeded');
                const transactionRecord = await tx.transaction.create({
                    data: {
                        amountMinor,
                        currency: 'NGN',
                        type: 'TRANSFER',
                        status: 'SUCCESS',
                        referenceId: idempotencyKey,
                        senderWalletId: senderWallet.id,
                        receiverWalletId: receiverWallet.id,
                        metadata: { description: `Transfer to ${receiver.email}` },
                    },
                });
                await tx.wallet.update({
                    where: { id: senderWallet.id },
                    data: {
                        balanceMinor: {
                            decrement: amountMinor,
                        },
                    },
                });
                await tx.wallet.update({
                    where: { id: receiverWallet.id },
                    data: {
                        balanceMinor: {
                            increment: amountMinor,
                        },
                    },
                });
                return {
                    transactionRecord: (0, money_1.transactionResponse)(transactionRecord),
                    senderEmail: sender.email,
                    receiverEmail: receiver.email,
                    receiverId: receiver.id,
                };
            });
            const result = execution.value;
            if (execution.replayed)
                return result.transactionRecord;
            this.emailService
                .sendTransferReceipt(result.senderEmail, (0, money_1.formatMinor)(amountMinor), result.receiverEmail)
                .catch(console.error);
            this.emailService
                .sendTransferReceivedEmail(result.receiverEmail, (0, money_1.formatMinor)(amountMinor), result.senderEmail)
                .catch(console.error);
            this.notificationService
                .notifyTransferReceived(result.receiverId, (0, money_1.formatMinor)(amountMinor), result.senderEmail)
                .catch(console.error);
            return result.transactionRecord;
        }
        catch (error) {
            if (error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
                throw new common_1.ConflictException('A transaction with this idempotency key has already been processed');
            }
            throw error;
        }
    }
    async reverseTransaction(actorId, transactionId, reason, key) {
        if (typeof reason !== 'string' || !reason.trim() || reason.trim().length > 500)
            throw new common_1.BadRequestException('A reason of 1–500 characters is required');
        reason = reason.trim();
        const actor = await this.prisma.user.findUnique({ where: { id: actorId } });
        if (!actor?.isActive || actor.closedAt || actor.role !== 'ADMIN')
            throw new common_1.ForbiddenException();
        const result = await this.idempotent(key, ['reversal', actorId, transactionId, reason], async (tx) => {
            await tx.$queryRaw `SELECT id FROM users WHERE id = ${actorId} FOR UPDATE`;
            const admin = await tx.user.findUniqueOrThrow({ where: { id: actorId } });
            if (!admin.isActive || admin.closedAt || admin.role !== 'ADMIN')
                throw new common_1.ForbiddenException();
            await tx.$queryRaw `SELECT pg_advisory_xact_lock(hashtextextended(${`reversal:${transactionId}`}, 0))::text`;
            const original = await tx.transaction.findUnique({
                where: { id: transactionId },
                include: { ledgerJournal: true, reversal: true },
            });
            if (!original)
                throw new common_1.NotFoundException('Transaction not found');
            if (original.reversal)
                throw new common_1.ConflictException('Transaction already reversed');
            if (original.status !== 'SUCCESS' ||
                original.reversalOfId ||
                !original.ledgerJournal ||
                original.type === 'DEBIT')
                throw new common_1.BadRequestException('Only posted internal transfers and funding can be reversed; withdrawals require provider reconciliation');
            const ids = [original.senderWalletId, original.receiverWalletId]
                .filter((id) => id !== null)
                .sort();
            for (const id of ids)
                await tx.$queryRaw `SELECT id FROM wallets WHERE id = ${id} FOR UPDATE`;
            if (!original.receiverWalletId)
                throw new common_1.BadRequestException('Original credit wallet is missing');
            const debit = await tx.wallet.findUniqueOrThrow({
                where: { id: original.receiverWalletId },
            });
            if (debit.closedAt)
                throw new common_1.ConflictException('Cannot reverse through a closed wallet');
            if (debit.balanceMinor - debit.reservedMinor < original.amountMinor)
                throw new common_1.BadRequestException('Insufficient available balance to reverse');
            if (original.senderWalletId) {
                const credit = await tx.wallet.findUniqueOrThrow({
                    where: { id: original.senderWalletId },
                });
                if (credit.closedAt)
                    throw new common_1.ConflictException('Cannot reverse through a closed wallet');
                if (credit.balanceMinor + original.amountMinor > money_1.MAX_MINOR)
                    throw new common_1.BadRequestException('Wallet balance limit exceeded');
                await tx.wallet.update({
                    where: { id: credit.id },
                    data: { balanceMinor: { increment: original.amountMinor } },
                });
            }
            await tx.wallet.update({
                where: { id: debit.id },
                data: { balanceMinor: { decrement: original.amountMinor } },
            });
            const reversal = await tx.transaction.create({
                data: {
                    reversalOfId: original.id,
                    amountMinor: original.amountMinor,
                    currency: original.currency,
                    type: original.type === 'TRANSFER' ? 'TRANSFER' : 'DEBIT',
                    status: 'SUCCESS',
                    referenceId: key,
                    senderWalletId: original.receiverWalletId,
                    receiverWalletId: original.senderWalletId,
                    metadata: { reason, actorId },
                },
            });
            await tx.auditLog.create({
                data: {
                    userId: actorId,
                    action: 'TRANSACTION_REVERSED',
                    metadata: {
                        originalTransactionId: original.id,
                        reversalTransactionId: reversal.id,
                        reason,
                    },
                },
            });
            return (0, money_1.transactionResponse)(reversal);
        });
        return result.value;
    }
    async reserveWithdrawal(userId, amount, reference) {
        const amountMinor = (0, money_1.parseNaira)(amount);
        this.validateKey(reference);
        return this.prisma.$transaction(async (tx) => {
            await tx.$queryRaw `SELECT pg_advisory_xact_lock(hashtextextended(${`withdrawal:${reference}`}, 0))::text`;
            const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
            await tx.$queryRaw `SELECT id FROM wallets WHERE id = ${wallet.id} FOR UPDATE`;
            const existing = await tx.withdrawalReservation.findUnique({ where: { reference } });
            if (existing) {
                if (existing.walletId !== wallet.id || existing.amountMinor !== amountMinor)
                    throw new common_1.ConflictException('Withdrawal reference already used');
                return (0, money_1.transactionResponse)(existing);
            }
            const current = await tx.wallet.findUniqueOrThrow({ where: { id: wallet.id } });
            if (current.closedAt)
                throw new common_1.ConflictException('Wallet is closed');
            if (current.currency !== 'NGN')
                throw new common_1.BadRequestException('Only NGN wallets are supported');
            if (current.balanceMinor - current.reservedMinor < amountMinor)
                throw new common_1.BadRequestException('Insufficient available balance');
            const reservation = await tx.withdrawalReservation.create({
                data: { walletId: wallet.id, currency: current.currency, amountMinor, reference },
            });
            return (0, money_1.transactionResponse)(reservation);
        });
    }
    async resolveWithdrawal(reference, outcome) {
        if (outcome !== 'CAPTURED' && outcome !== 'RELEASED')
            throw new common_1.BadRequestException('Invalid withdrawal outcome');
        return this.prisma.$transaction(async (tx) => {
            const reservation = await tx.withdrawalReservation.findUniqueOrThrow({
                where: { reference },
            });
            await tx.$queryRaw `SELECT id FROM wallets WHERE id = ${reservation.walletId} FOR UPDATE`;
            const current = await tx.withdrawalReservation.findUniqueOrThrow({ where: { reference } });
            if (current.status === outcome)
                return (0, money_1.transactionResponse)(current);
            if (current.status !== 'PENDING')
                throw new common_1.ConflictException('Withdrawal already resolved');
            return (0, money_1.transactionResponse)(await tx.withdrawalReservation.update({
                where: { reference },
                data: { status: outcome },
            }));
        });
    }
    async getTransactionHistory(userId, query) {
        const { page = 1, limit = 10, type, startDate, endDate } = query;
        const skip = (page - 1) * limit;
        const wallet = await this.prisma.wallet.findUnique({
            where: { userId },
        });
        if (!wallet) {
            throw new common_1.NotFoundException('Wallet not found');
        }
        const where = {
            OR: [{ senderWalletId: wallet.id }, { receiverWalletId: wallet.id }],
        };
        if (type) {
            where.type = type;
        }
        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) {
                where.createdAt.gte = new Date(startDate);
            }
            if (endDate) {
                where.createdAt.lte = new Date(endDate);
            }
        }
        const [transactions, totalItems] = await Promise.all([
            this.prisma.transaction.findMany({
                where,
                take: limit,
                skip,
                orderBy: { createdAt: 'desc' },
            }),
            this.prisma.transaction.count({ where }),
        ]);
        return {
            data: transactions.map(money_1.transactionResponse),
            meta: {
                totalItems,
                itemCount: transactions.length,
                itemsPerPage: limit,
                totalPages: Math.ceil(totalItems / limit),
                currentPage: page,
            },
        };
    }
};
exports.WalletService = WalletService;
exports.WalletService = WalletService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        email_service_1.EmailService,
        notification_service_1.NotificationService,
        config_1.ConfigService])
], WalletService);
//# sourceMappingURL=wallet.service.js.map