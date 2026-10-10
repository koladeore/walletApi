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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminLimitsController = exports.LimitsController = void 0;
const cursor_1 = require("../common/pagination/cursor");
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const prisma_service_1 = require("../prisma/prisma.service");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const admin_guard_1 = require("../auth/guards/admin.guard");
const staff_read_audit_interceptor_1 = require("../auth/guards/staff-read-audit.interceptor");
const financial_reason_dto_1 = require("../common/dto/financial-reason.dto");
const step_up_guard_1 = require("../security/step-up.guard");
const limits_service_1 = require("./limits.service");
class TierDto extends financial_reason_dto_1.FinancialReasonDto {
    tier;
}
__decorate([
    (0, swagger_1.ApiProperty)({
        enum: ['BASIC', 'VERIFIED'],
        description: 'VERIFIED requires manual review; this designation does not assert regulatory identity verification.',
    }),
    (0, class_validator_1.IsIn)(['BASIC', 'VERIFIED']),
    __metadata("design:type", String)
], TierDto.prototype, "tier", void 0);
let LimitsController = class LimitsController {
    limits;
    constructor(limits) {
        this.limits = limits;
    }
    get(req) {
        return this.limits.status(req.user.id);
    }
};
exports.LimitsController = LimitsController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({
        summary: 'Read your tier, daily usage and outgoing limits',
        description: 'Transfers and requested payouts share the daily limit, resetting at midnight Africa/Lagos. Failed/reversed payouts do not restore daily allowance. Unverified email permits no outgoing transactions.',
    }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], LimitsController.prototype, "get", null);
exports.LimitsController = LimitsController = __decorate([
    (0, swagger_1.ApiTags)('account-limits'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Controller)('wallet/limits'),
    __metadata("design:paramtypes", [limits_service_1.LimitsService])
], LimitsController);
let AdminLimitsController = class AdminLimitsController {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async change(req, userId, reason, tier) {
        return this.prisma.$transaction(async (tx) => {
            for (const id of [...new Set([req.user.id, userId])].sort())
                await tx.$queryRaw `SELECT id FROM users WHERE id=${id} FOR UPDATE`;
            const actor = await tx.user.findUniqueOrThrow({ where: { id: req.user.id } });
            if (!actor.isActive ||
                actor.closedAt ||
                actor.role !== 'ADMIN' ||
                actor.authVersion !== req.stepUpAuthVersion)
                throw new common_1.ForbiddenException('Current administrator step-up required');
            const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
            if (tier) {
                if (!user.isActive || user.closedAt || (tier === 'VERIFIED' && !user.emailVerifiedAt))
                    throw new common_1.ForbiddenException('Active verified-email account required for upgrade');
                await tx.user.update({ where: { id: userId }, data: { accountTier: tier } });
            }
            else {
                await tx.$queryRaw `SELECT id FROM wallets WHERE "userId"=${userId} FOR UPDATE`;
                await tx.wallet.update({ where: { userId }, data: { outgoingFrozen: true } });
            }
            await tx.auditLog.create({
                data: {
                    userId: actor.id,
                    action: tier ? 'ACCOUNT_TIER_CHANGED' : 'WALLET_OUTGOING_FROZEN',
                    metadata: {
                        targetUserId: userId,
                        reason,
                        ...(tier ? { previousTier: user.accountTier, tier } : {}),
                    },
                },
            });
            return tier ? { userId, tier } : { userId, outgoingFrozen: true };
        });
    }
    tier(req, id, dto) {
        return this.change(req, id, dto.reason, dto.tier);
    }
    freeze(req, id, dto) {
        return this.change(req, id, dto.reason);
    }
    async flags(query) {
        const scope = 'activity-flags:open';
        const rows = await this.prisma.activityFlag.findMany({
            where: { AND: [{ status: 'OPEN' }, (0, cursor_1.cursorBounds)(query.cursor, scope)] },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: query.limit + 1,
        });
        return (0, cursor_1.cursorPage)(rows, query.limit, scope);
    }
    resolve(req, id, dto) {
        return this.prisma.$transaction(async (tx) => {
            await tx.$queryRaw `SELECT id FROM users WHERE id=${req.user.id} FOR SHARE`;
            const actor = await tx.user.findUniqueOrThrow({ where: { id: req.user.id } });
            if (!actor.isActive ||
                actor.closedAt ||
                actor.role !== 'ADMIN' ||
                actor.authVersion !== req.stepUpAuthVersion)
                throw new common_1.ForbiddenException('Current administrator step-up required');
            const flag = await tx.activityFlag.update({
                where: { id },
                data: { status: 'RESOLVED', resolvedAt: new Date(), resolution: dto.reason },
            });
            await tx.auditLog.create({
                data: {
                    userId: actor.id,
                    action: 'ACTIVITY_FLAG_RESOLVED',
                    metadata: { flagId: id, targetUserId: flag.userId, reason: dto.reason },
                },
            });
            return flag;
        });
    }
};
exports.AdminLimitsController = AdminLimitsController;
__decorate([
    (0, common_1.Post)('users/:id/tier'),
    (0, common_1.HttpCode)(200),
    (0, step_up_guard_1.SensitiveAction)('ADMIN'),
    (0, swagger_1.ApiOperation)({ summary: 'Set account tier after manual review; requires exact ADMIN proof' }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', new common_1.ParseUUIDPipe())),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, TierDto]),
    __metadata("design:returntype", void 0)
], AdminLimitsController.prototype, "tier", null);
__decorate([
    (0, common_1.Post)('users/:id/freeze'),
    (0, common_1.HttpCode)(200),
    (0, step_up_guard_1.SensitiveAction)('ADMIN'),
    (0, swagger_1.ApiOperation)({
        summary: 'Freeze outgoing transfers and new payouts with an investigation reason',
        description: 'Incoming credits and settlement of already submitted payouts remain possible. Unfreeze uses the existing financial-operations wallet endpoint.',
    }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', new common_1.ParseUUIDPipe())),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, financial_reason_dto_1.FinancialReasonDto]),
    __metadata("design:returntype", void 0)
], AdminLimitsController.prototype, "freeze", null);
__decorate([
    (0, common_1.Get)('flags'),
    (0, swagger_1.ApiOperation)({
        summary: 'List open suspicious-activity flags with cursor pagination',
        description: 'Flags require investigation; they do not automatically declare fraud or freeze money.',
    }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [cursor_1.CursorQueryDto]),
    __metadata("design:returntype", Promise)
], AdminLimitsController.prototype, "flags", null);
__decorate([
    (0, common_1.Post)('flags/:id/resolve'),
    (0, common_1.HttpCode)(200),
    (0, step_up_guard_1.SensitiveAction)('ADMIN'),
    (0, swagger_1.ApiOperation)({ summary: 'Record investigation outcome; does not unfreeze a wallet' }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', new common_1.ParseUUIDPipe())),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, financial_reason_dto_1.FinancialReasonDto]),
    __metadata("design:returntype", void 0)
], AdminLimitsController.prototype, "resolve", null);
exports.AdminLimitsController = AdminLimitsController = __decorate([
    (0, swagger_1.ApiTags)('admin-account-controls'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, admin_guard_1.AdminGuard),
    (0, common_1.UseInterceptors)(staff_read_audit_interceptor_1.StaffReadAuditInterceptor),
    (0, common_1.Controller)('admin/account-controls'),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], AdminLimitsController);
//# sourceMappingURL=limits.controller.js.map