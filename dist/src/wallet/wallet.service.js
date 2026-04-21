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
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const client_1 = require("@prisma/client");
const email_service_1 = require("../email/email.service");
const notification_service_1 = require("../notification/notification.service");
let WalletService = class WalletService {
    prisma;
    emailService;
    notificationService;
    constructor(prisma, emailService, notificationService) {
        this.prisma = prisma;
        this.emailService = emailService;
        this.notificationService = notificationService;
    }
    async fundWallet(userId, amount, idempotencyKey) {
        try {
            return await this.prisma.$transaction(async (tx) => {
                const wallet = await tx.wallet.findUnique({
                    where: { userId },
                });
                if (!wallet) {
                    throw new common_1.NotFoundException('Wallet not found');
                }
                await tx.$queryRaw `SELECT id FROM wallets WHERE id = ${wallet.id} FOR UPDATE`;
                const transaction = await tx.transaction.create({
                    data: {
                        amount,
                        type: 'CREDIT',
                        status: 'SUCCESS',
                        referenceId: idempotencyKey,
                        receiverWalletId: wallet.id,
                        metadata: { description: 'Wallet Funding' },
                    },
                });
                const updatedWallet = await tx.wallet.update({
                    where: { id: wallet.id },
                    data: {
                        balance: {
                            increment: amount,
                        },
                    },
                });
                return { wallet: updatedWallet, transaction };
            });
        }
        catch (error) {
            if (error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
                throw new common_1.ConflictException('A transaction with this idempotency key has already been processed');
            }
            throw error;
        }
    }
    async transferFunds(senderId, receiverEmail, amount, idempotencyKey) {
        if (amount <= 0) {
            throw new common_1.BadRequestException('Transfer amount must be greater than zero');
        }
        try {
            const result = await this.prisma.$transaction(async (tx) => {
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
                const firstLockId = senderWallet.id < receiverWallet.id ? senderWallet.id : receiverWallet.id;
                const secondLockId = senderWallet.id < receiverWallet.id ? receiverWallet.id : senderWallet.id;
                await tx.$queryRaw `SELECT id FROM wallets WHERE id = ${firstLockId} FOR UPDATE`;
                await tx.$queryRaw `SELECT id FROM wallets WHERE id = ${secondLockId} FOR UPDATE`;
                const freshSenderWallet = await tx.wallet.findUnique({ where: { id: senderWallet.id } });
                if (!freshSenderWallet || Number(freshSenderWallet.balance) < amount) {
                    throw new common_1.BadRequestException('Insufficient balance');
                }
                const transactionRecord = await tx.transaction.create({
                    data: {
                        amount,
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
                        balance: {
                            decrement: amount,
                        },
                    },
                });
                await tx.wallet.update({
                    where: { id: receiverWallet.id },
                    data: {
                        balance: {
                            increment: amount,
                        },
                    },
                });
                return {
                    transactionRecord,
                    senderEmail: sender.email,
                    receiverEmail: receiver.email,
                    receiverId: receiver.id,
                };
            });
            this.emailService.sendTransferReceipt(result.senderEmail, amount, result.receiverEmail).catch(console.error);
            this.emailService.sendTransferReceivedEmail(result.receiverEmail, amount, result.senderEmail).catch(console.error);
            this.notificationService.notifyTransferReceived(result.receiverId, amount, result.senderEmail).catch(console.error);
            return result.transactionRecord;
        }
        catch (error) {
            if (error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
                throw new common_1.ConflictException('A transaction with this idempotency key has already been processed');
            }
            throw error;
        }
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
            OR: [
                { senderWalletId: wallet.id },
                { receiverWalletId: wallet.id },
            ],
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
            data: transactions,
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
        notification_service_1.NotificationService])
], WalletService);
//# sourceMappingURL=wallet.service.js.map