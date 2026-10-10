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
exports.DeliveryController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const config_1 = require("@nestjs/config");
const prisma_service_1 = require("../prisma/prisma.service");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const admin_guard_1 = require("../auth/guards/admin.guard");
const staff_read_audit_interceptor_1 = require("../auth/guards/staff-read-audit.interceptor");
const step_up_guard_1 = require("../security/step-up.guard");
const cursor_1 = require("../common/pagination/cursor");
const financial_reason_dto_1 = require("../common/dto/financial-reason.dto");
class DeliveryQuery extends cursor_1.CursorQueryDto {
    status = 'FAILED';
}
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: ['FAILED', 'SKIPPED', 'PENDING'], default: 'FAILED' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['FAILED', 'SKIPPED', 'PENDING']),
    __metadata("design:type", Object)
], DeliveryQuery.prototype, "status", void 0);
const select = {
    id: true,
    userId: true,
    kind: true,
    title: true,
    createdAt: true,
    emailFirstAttemptAt: true,
    emailStatus: true,
    emailAttempts: true,
    emailBatchAttempts: true,
    emailRecoveryCount: true,
    emailLastError: true,
    emailNextAttemptAt: true,
    emailLockedUntil: true,
};
let DeliveryController = class DeliveryController {
    prisma;
    config;
    constructor(prisma, config) {
        this.prisma = prisma;
        this.config = config;
    }
    async list(query) {
        const scope = `notification-deliveries:${query.status}`;
        const rows = await this.prisma.notification.findMany({
            where: { AND: [{ emailStatus: query.status }, (0, cursor_1.cursorBounds)(query.cursor, scope)] },
            select,
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: query.limit + 1,
        });
        return (0, cursor_1.cursorPage)(rows, query.limit, scope);
    }
    async get(id) {
        const row = await this.prisma.notification.findUnique({ where: { id }, select });
        if (!row)
            throw new common_1.NotFoundException('Delivery not found');
        return row;
    }
    retry(req, id, dto) {
        if (this.config.get('AUTH_DELIVERY_MODE') !== 'provider' ||
            this.config.get('NOTIFICATION_EMAIL_ENABLED') === 'false')
            throw new common_1.ConflictException('Notification email delivery is disabled');
        return this.prisma.$transaction(async (tx) => {
            await tx.$queryRaw `SELECT id FROM users WHERE id=${req.user.id} FOR SHARE`;
            const actor = await tx.user.findUniqueOrThrow({ where: { id: req.user.id } });
            if (!actor.isActive ||
                actor.closedAt ||
                actor.role !== 'ADMIN' ||
                actor.authVersion !== req.stepUpAuthVersion)
                throw new common_1.ForbiddenException('Current administrator step-up required');
            await tx.$queryRaw `SELECT id FROM notifications WHERE id=${id} FOR UPDATE`;
            const row = await tx.notification.findUnique({ where: { id }, include: { user: true } });
            if (!row)
                throw new common_1.NotFoundException('Delivery not found');
            if (!['FAILED', 'SKIPPED'].includes(row.emailStatus) ||
                (row.emailLockedUntil && row.emailLockedUntil > new Date()) ||
                (row.emailFirstAttemptAt && row.emailFirstAttemptAt.getTime() < Date.now() - 3600000) ||
                row.emailRecoveryCount >= 3 ||
                row.emailLastError === 'LEGACY_DELIVERY_REVIEW_REQUIRED')
                throw new common_1.ConflictException('Delivery is not eligible for safe retry');
            if (!row.user.isActive ||
                row.user.closedAt ||
                (row.kind !== 'WELCOME' && !row.user.emailVerifiedAt) ||
                (row.emailRecipient && row.emailRecipient !== row.user.email))
                throw new common_1.ConflictException('Delivery recipient is not eligible');
            const updated = await tx.notification.update({
                where: { id },
                data: {
                    emailStatus: 'PENDING',
                    emailBatchAttempts: 0,
                    emailRecoveryCount: { increment: 1 },
                    emailLockedUntil: null,
                    emailNextAttemptAt: new Date(),
                },
                select,
            });
            await tx.auditLog.create({
                data: {
                    userId: actor.id,
                    action: 'NOTIFICATION_DELIVERY_REQUEUED',
                    metadata: {
                        notificationId: id,
                        targetUserId: row.userId,
                        previousStatus: row.emailStatus,
                        previousFailure: row.emailLastError,
                        reason: dto.reason,
                    },
                },
            });
            return updated;
        });
    }
};
exports.DeliveryController = DeliveryController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({
        summary: 'Inspect failed, skipped or pending notification email deliveries',
        description: 'Safe failure codes only; security verification codes use a separate store and are never returned here.',
    }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [DeliveryQuery]),
    __metadata("design:returntype", Promise)
], DeliveryController.prototype, "list", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Inspect one notification email delivery' }),
    __param(0, (0, common_1.Param)('id', new common_1.ParseUUIDPipe())),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], DeliveryController.prototype, "get", null);
__decorate([
    (0, common_1.Post)(':id/retry'),
    (0, common_1.HttpCode)(200),
    (0, step_up_guard_1.SensitiveAction)('ADMIN'),
    (0, swagger_1.ApiOperation)({
        summary: 'Requeue an eligible failed notification delivery with an audited reason',
        description: 'Requires exact ADMIN step-up proof. Only FAILED/SKIPPED events within one hour of their first send attempt (or never sent), eligible unchanged recipients, and at most three recoveries. Preserves event and email idempotency key. Never retries sent or uncertain legacy deliveries.',
    }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', new common_1.ParseUUIDPipe())),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, financial_reason_dto_1.FinancialReasonDto]),
    __metadata("design:returntype", void 0)
], DeliveryController.prototype, "retry", null);
exports.DeliveryController = DeliveryController = __decorate([
    (0, swagger_1.ApiTags)('admin-notification-deliveries'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, admin_guard_1.AdminGuard),
    (0, common_1.UseInterceptors)(staff_read_audit_interceptor_1.StaffReadAuditInterceptor),
    (0, common_1.Controller)('admin/notification-deliveries'),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        config_1.ConfigService])
], DeliveryController);
//# sourceMappingURL=delivery.controller.js.map