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
exports.LimitsService = void 0;
exports.lagosDay = lagosDay;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const prisma_service_1 = require("../prisma/prisma.service");
const money_1 = require("../common/money/money");
function lagosDay(date = new Date()) {
    return new Date(date.getTime() + 3600_000).toISOString().slice(0, 10);
}
let LimitsService = class LimitsService {
    prisma;
    policies;
    constructor(prisma, config) {
        this.prisma = prisma;
        this.policies = {
            BASIC: {
                transaction: (0, money_1.parseNaira)(config.get('LIMIT_BASIC_TRANSACTION_NGN') ?? '50000'),
                daily: (0, money_1.parseNaira)(config.get('LIMIT_BASIC_DAILY_NGN') ?? '100000'),
            },
            VERIFIED: {
                transaction: (0, money_1.parseNaira)(config.get('LIMIT_VERIFIED_TRANSACTION_NGN') ?? '100000'),
                daily: (0, money_1.parseNaira)(config.get('LIMIT_VERIFIED_DAILY_NGN') ?? '500000'),
            },
        };
        for (const policy of Object.values(this.policies))
            if (policy.transaction > policy.daily)
                throw new Error('Transaction limit must not exceed daily limit');
    }
    async consume(tx, userId, amountMinor, reference) {
        const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
        if (!user.isActive || user.closedAt || !user.emailVerifiedAt)
            throw new common_1.ForbiddenException('Active account and verified email required');
        const policy = this.policies[user.accountTier];
        if (!policy)
            throw new common_1.ForbiddenException('Unsupported account tier');
        if (amountMinor > policy.transaction)
            throw new common_1.BadRequestException('Transaction limit exceeded');
        const day = lagosDay();
        const id = `${userId}:${day}`;
        const current = await tx.dailyOutgoing.upsert({
            where: { id },
            create: { id, userId, day },
            update: {},
        });
        if (current.amountMinor + amountMinor > policy.daily)
            throw new common_1.BadRequestException('Daily outgoing limit exceeded');
        await tx.dailyOutgoing.update({
            where: { id },
            data: { amountMinor: { increment: amountMinor } },
        });
        const since = new Date(Date.now() - 10 * 60_000);
        const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
        const count = (await tx.transaction.count({
            where: {
                senderWalletId: wallet.id,
                type: 'TRANSFER',
                status: 'SUCCESS',
                reversalOfId: null,
                createdAt: { gte: since },
            },
        })) +
            (await tx.payout.count({ where: { userId, createdAt: { gte: since } } })) +
            1;
        if (count >= 5 || current.amountMinor + amountMinor >= (policy.daily * 9n) / 10n) {
            const kind = count >= 5 ? 'OUTGOING_VELOCITY' : 'DAILY_LIMIT_NEAR';
            await tx.activityFlag.upsert({
                where: { key: `${id}:${kind}` },
                create: {
                    key: `${id}:${kind}`,
                    userId,
                    kind,
                    details: {
                        reference,
                        countInTenMinutes: count,
                        day,
                        usedMinor: (current.amountMinor + amountMinor).toString(),
                    },
                },
                update: {},
            });
        }
    }
    async status(userId) {
        const user = await this.prisma.user.findUniqueOrThrow({
            where: { id: userId },
            include: { wallet: true },
        });
        const policy = this.policies[user.accountTier];
        const day = lagosDay();
        const usage = await this.prisma.dailyOutgoing.findUnique({ where: { id: `${userId}:${day}` } });
        const used = usage?.amountMinor ?? 0n;
        const daily = user.emailVerifiedAt ? policy.daily : 0n;
        return {
            tier: user.accountTier,
            emailVerified: Boolean(user.emailVerifiedAt),
            timezone: 'Africa/Lagos',
            day,
            transactionLimit: (0, money_1.formatMinor)(user.emailVerifiedAt ? policy.transaction : 0n),
            dailyLimit: (0, money_1.formatMinor)(daily),
            usedToday: (0, money_1.formatMinor)(used),
            remainingToday: (0, money_1.formatMinor)(used < daily ? daily - used : 0n),
            outgoingFrozen: user.wallet?.outgoingFrozen ?? false,
        };
    }
};
exports.LimitsService = LimitsService;
exports.LimitsService = LimitsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        config_1.ConfigService])
], LimitsService);
//# sourceMappingURL=limits.service.js.map