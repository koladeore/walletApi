"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UsersService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const bcrypt = __importStar(require("bcrypt"));
const email_service_1 = require("../email/email.service");
const money_1 = require("../common/money/money");
const userProfileSelect = {
    id: true,
    email: true,
    firstName: true,
    lastName: true,
    isActive: true,
    createdAt: true,
    updatedAt: true,
};
let UsersService = class UsersService {
    prisma;
    emailService;
    constructor(prisma, emailService) {
        this.prisma = prisma;
        this.emailService = emailService;
    }
    async findByEmail(email) {
        return this.prisma.user.findUnique({
            where: { email },
        });
    }
    async findById(id) {
        return this.prisma.user.findUnique({
            where: { id },
        });
    }
    async getProfile(id) {
        const user = await this.prisma.user.findUnique({
            where: { id },
            select: { ...userProfileSelect, role: true },
        });
        return user;
    }
    async getAllUsers() {
        return this.prisma.user.findMany({
            select: userProfileSelect,
            orderBy: { id: 'asc' },
        });
    }
    async getWallet(userId) {
        const wallet = await this.prisma.wallet.findUnique({
            where: { userId },
        });
        return wallet ? (0, money_1.walletResponse)(wallet) : null;
    }
    async lookupRecipient(email) {
        return this.prisma.user.findFirst({
            where: { email, isActive: true, wallet: { isNot: null } },
            select: { id: true, firstName: true, lastName: true },
        });
    }
    async create(data) {
        const existingUser = await this.findByEmail(data.email);
        if (existingUser) {
            throw new common_1.ConflictException('Email already exists');
        }
        const salt = await bcrypt.genSalt();
        const hashedPassword = await bcrypt.hash(data.password, salt);
        const createdUser = await this.prisma.$transaction(async (tx) => {
            const user = await tx.user.create({
                data: {
                    email: data.email,
                    firstName: data.firstName,
                    lastName: data.lastName,
                    password: hashedPassword,
                    role: 'USER',
                },
                select: userProfileSelect,
            });
            await tx.wallet.create({
                data: {
                    userId: user.id,
                    currency: 'NGN',
                    balanceMinor: 0n,
                },
            });
            return user;
        });
        this.emailService
            .sendWelcomeEmail(createdUser.email, createdUser.firstName || 'User')
            .catch((err) => {
            console.error('Failed to queue welcome email', err);
        });
        return createdUser;
    }
    async closeAccount(actorId, userId, reason, expectedAuthVersion) {
        if (actorId === userId)
            throw new common_1.BadRequestException('You cannot close your own admin account');
        if (typeof reason !== 'string' || !reason.trim() || reason.trim().length > 500)
            throw new common_1.BadRequestException('A reason of 1–500 characters is required');
        return this.prisma.$transaction(async (tx) => {
            for (const id of [actorId, userId].sort())
                await tx.$queryRaw `SELECT id FROM users WHERE id = ${id} FOR UPDATE`;
            const actor = await tx.user.findUnique({ where: { id: actorId } });
            if (!actor?.isActive || actor.closedAt || actor.role !== 'ADMIN')
                throw new common_1.ForbiddenException();
            if (expectedAuthVersion !== undefined && actor.authVersion !== expectedAuthVersion)
                throw new common_1.ForbiddenException('Authentication changed; repeat step-up');
            const target = await tx.user.findUnique({ where: { id: userId } });
            if (!target)
                throw new common_1.NotFoundException('User not found');
            if (target.closedAt)
                return { id: target.id, closedAt: target.closedAt, isActive: false };
            const wallet = await tx.wallet.findUnique({ where: { userId } });
            if (wallet) {
                await tx.$queryRaw `SELECT id FROM wallets WHERE id = ${wallet.id} FOR UPDATE`;
                const current = await tx.wallet.findUniqueOrThrow({ where: { id: wallet.id } });
                if (current.balanceMinor !== 0n || current.reservedMinor !== 0n)
                    throw new common_1.ConflictException('Settle the balance and pending withdrawals before closure');
            }
            await tx.authSession.updateMany({
                where: { userId, revokedAt: null },
                data: { revokedAt: new Date(), revokeReason: 'ACCOUNT_CLOSED' },
            });
            const user = await tx.user.update({
                where: { id: userId },
                data: { closedAt: new Date(), isActive: false, authVersion: { increment: 1 } },
                select: { id: true, closedAt: true, isActive: true },
            });
            await tx.auditLog.create({
                data: {
                    userId: actorId,
                    action: 'ACCOUNT_CLOSED',
                    metadata: { targetUserId: userId, reason: reason.trim() },
                },
            });
            return user;
        });
    }
    async updateStatus(actorId, userId, dto, expectedAuthVersion) {
        if (actorId === userId && !dto.isActive) {
            throw new common_1.BadRequestException('You cannot deactivate your own account');
        }
        return this.prisma.$transaction(async (tx) => {
            const ids = [...new Set([actorId, userId])].sort();
            for (const id of ids) {
                await tx.$queryRaw `SELECT id FROM users WHERE id = ${id} FOR UPDATE`;
            }
            const actor = await tx.user.findUnique({ where: { id: actorId } });
            if (!actor?.isActive || actor.role !== 'ADMIN')
                throw new common_1.ForbiddenException();
            if (expectedAuthVersion !== undefined && actor.authVersion !== expectedAuthVersion)
                throw new common_1.ForbiddenException('Authentication changed; repeat step-up');
            const target = await tx.user.findUnique({ where: { id: userId } });
            if (!target)
                throw new common_1.NotFoundException('User not found');
            if (target.closedAt)
                throw new common_1.ConflictException('Closed accounts cannot change status');
            const changed = target.isActive !== dto.isActive;
            const user = await tx.user.update({
                where: { id: userId },
                data: {
                    isActive: dto.isActive,
                    ...(changed ? { authVersion: { increment: 1 } } : {}),
                },
                select: userProfileSelect,
            });
            if (changed || !dto.isActive) {
                await tx.authSession.updateMany({
                    where: { userId, revokedAt: null },
                    data: { revokedAt: new Date(), revokeReason: 'ACCOUNT_STATUS_CHANGED' },
                });
                await tx.authToken.updateMany({
                    where: { userId, isRevoked: false },
                    data: { isRevoked: true },
                });
            }
            await tx.auditLog.create({
                data: {
                    userId: actorId,
                    action: 'USER_STATUS_UPDATED',
                    metadata: {
                        targetUserId: userId,
                        previousIsActive: target.isActive,
                        isActive: dto.isActive,
                        reason: dto.reason,
                    },
                },
            });
            return user;
        });
    }
};
exports.UsersService = UsersService;
exports.UsersService = UsersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        email_service_1.EmailService])
], UsersService);
//# sourceMappingURL=users.service.js.map