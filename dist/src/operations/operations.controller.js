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
exports.OperationsController = void 0;
const cursor_1 = require("../common/pagination/cursor");
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
const swagger_2 = require("@nestjs/swagger");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const admin_guard_1 = require("../auth/guards/admin.guard");
const prisma_service_1 = require("../prisma/prisma.service");
const reconciliation_service_1 = require("./reconciliation.service");
const staff_read_audit_interceptor_1 = require("../auth/guards/staff-read-audit.interceptor");
const step_up_guard_1 = require("../security/step-up.guard");
class InvestigationDto {
    reason;
}
__decorate([
    (0, swagger_2.ApiProperty)({ description: 'Investigation result and external evidence reference' }),
    (0, class_transformer_1.Transform)(({ obj }) => typeof obj.reason === 'string' ? obj.reason.trim() : obj.reason),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(10),
    (0, class_validator_1.MaxLength)(1000),
    __metadata("design:type", String)
], InvestigationDto.prototype, "reason", void 0);
let OperationsController = class OperationsController {
    prisma;
    reconciliation;
    constructor(prisma, reconciliation) {
        this.prisma = prisma;
        this.reconciliation = reconciliation;
    }
    unfreeze(req, id, dto) {
        return this.prisma.$transaction(async (tx) => {
            await tx.$queryRaw `SELECT id FROM users WHERE id=${req.user.id} FOR SHARE`;
            const actor = await tx.user.findUnique({ where: { id: req.user.id } });
            if (!actor?.isActive || actor.closedAt || actor.role !== 'ADMIN')
                throw new common_1.ForbiddenException('Active administrator required');
            if (req.stepUpAuthVersion !== undefined && actor.authVersion !== req.stepUpAuthVersion)
                throw new common_1.ForbiddenException('Authentication changed; repeat step-up');
            await tx.$queryRaw `SELECT id FROM wallets WHERE id=${id} FOR UPDATE`;
            const wallet = await tx.wallet.findUniqueOrThrow({ where: { id } });
            const cases = await tx.financialCase.findMany({ where: { walletId: id } });
            const references = cases.map((item) => item.reference);
            if (cases.some((item) => item.kind === 'DISPUTE' &&
                !item.applied &&
                !['resolved', 'archived'].includes(item.providerStatus)) ||
                (await tx.reconciliationIssue.count({
                    where: {
                        status: 'OPEN',
                        OR: [
                            { reference: { in: references } },
                            { details: { path: ['walletId'], equals: id } },
                        ],
                    },
                })))
                throw new common_1.ConflictException('Resolve active disputes and investigation issues before unfreezing');
            if (await tx.activityFlag.count({ where: { userId: wallet.userId, status: 'OPEN' } }))
                throw new common_1.ConflictException('Resolve suspicious activity flags before unfreezing');
            if (wallet.closedAt)
                throw new common_1.ConflictException('Closed wallets cannot be unfrozen');
            const updated = await tx.wallet.update({ where: { id }, data: { outgoingFrozen: false } });
            await tx.auditLog.create({
                data: {
                    userId: req.user.id,
                    action: 'WALLET_OUTGOING_UNFROZEN',
                    metadata: { walletId: id, reason: dto.reason },
                },
            });
            return { walletId: updated.id, outgoingFrozen: updated.outgoingFrozen };
        });
    }
    async run(req, dto) {
        await this.prisma.$transaction(async (tx) => {
            await tx.$queryRaw `SELECT id FROM users WHERE id=${req.user.id} FOR SHARE`;
            const actor = await tx.user.findUnique({ where: { id: req.user.id } });
            if (!actor?.isActive ||
                actor.closedAt ||
                actor.role !== 'ADMIN' ||
                actor.authVersion !== req.stepUpAuthVersion)
                throw new common_1.ForbiddenException('Active administrator and current step-up required');
            await tx.auditLog.create({
                data: {
                    userId: actor.id,
                    action: 'ADMIN_RECONCILIATION_REQUESTED',
                    metadata: { reason: dto.reason },
                },
            });
        });
        const run = await this.reconciliation.run();
        await this.prisma.auditLog.create({
            data: {
                userId: req.user.id,
                action: 'ADMIN_RECONCILIATION_COMPLETED',
                metadata: { runId: run.id, status: run.status, reason: dto.reason },
            },
        });
        return run;
    }
    async runs(query) {
        const scope = 'reconciliation-runs';
        const rows = await this.prisma.reconciliationRun.findMany({
            where: (0, cursor_1.cursorBounds)(query.cursor, scope, 'startedAt'),
            orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
            take: query.limit + 1,
        });
        return (0, cursor_1.cursorPage)(rows, query.limit, scope, 'startedAt');
    }
    async issues(query) {
        const scope = 'reconciliation-issues:open';
        const rows = await this.prisma.reconciliationIssue.findMany({
            where: { AND: [{ status: 'OPEN' }, (0, cursor_1.cursorBounds)(query.cursor, scope, 'firstSeenAt')] },
            orderBy: [{ firstSeenAt: 'desc' }, { id: 'desc' }],
            take: query.limit + 1,
        });
        return (0, cursor_1.cursorPage)(rows, query.limit, scope, 'firstSeenAt');
    }
    async cases(query) {
        const scope = 'financial-cases';
        const rows = await this.prisma.financialCase.findMany({
            where: (0, cursor_1.cursorBounds)(query.cursor, scope),
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: query.limit + 1,
        });
        return (0, cursor_1.cursorPage)(rows, query.limit, scope, 'createdAt', (row) => ({
            ...row,
            amountMinor: row.amountMinor.toString(),
            recoveredMinor: row.recoveredMinor.toString(),
            shortfallMinor: row.shortfallMinor.toString(),
        }));
    }
    async fees(query) {
        const scope = 'provider-fees';
        const rows = await this.prisma.providerFee.findMany({
            where: (0, cursor_1.cursorBounds)(query.cursor, scope),
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: query.limit + 1,
        });
        return (0, cursor_1.cursorPage)(rows, query.limit, scope, 'createdAt', (row) => ({
            ...row,
            amountMinor: row.amountMinor.toString(),
        }));
    }
    resolve(req, id, dto) {
        return this.prisma.$transaction(async (tx) => {
            await tx.$queryRaw `SELECT id FROM users WHERE id=${req.user.id} FOR SHARE`;
            const actor = await tx.user.findUnique({ where: { id: req.user.id } });
            if (!actor?.isActive || actor.closedAt || actor.role !== 'ADMIN')
                throw new common_1.ForbiddenException('Active administrator required');
            if (req.stepUpAuthVersion !== undefined && actor.authVersion !== req.stepUpAuthVersion)
                throw new common_1.ForbiddenException('Authentication changed; repeat step-up');
            const issue = await tx.reconciliationIssue.update({
                where: { id },
                data: { status: 'RESOLVED', resolvedAt: new Date(), resolution: dto.reason },
            });
            await tx.auditLog.create({
                data: {
                    userId: req.user.id,
                    action: 'RECONCILIATION_ISSUE_RESOLVED',
                    metadata: { issueId: id, reason: dto.reason },
                },
            });
            return issue;
        });
    }
};
exports.OperationsController = OperationsController;
__decorate([
    (0, common_1.Post)('wallets/:id/unfreeze'),
    (0, step_up_guard_1.SensitiveAction)('ADMIN'),
    (0, swagger_1.ApiOperation)({ summary: 'Unfreeze outgoing money after recorded investigation (admin)' }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, InvestigationDto]),
    __metadata("design:returntype", void 0)
], OperationsController.prototype, "unfreeze", null);
__decorate([
    (0, common_1.Post)('reconcile'),
    (0, step_up_guard_1.SensitiveAction)('ADMIN'),
    (0, swagger_1.ApiOperation)({ summary: 'Run provider and ledger reconciliation (admin)' }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, InvestigationDto]),
    __metadata("design:returntype", Promise)
], OperationsController.prototype, "run", null);
__decorate([
    (0, common_1.Get)('runs'),
    (0, swagger_1.ApiOperation)({ summary: 'List reconciliation runs with cursor pagination' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [cursor_1.CursorQueryDto]),
    __metadata("design:returntype", Promise)
], OperationsController.prototype, "runs", null);
__decorate([
    (0, common_1.Get)('issues'),
    (0, swagger_1.ApiOperation)({ summary: 'List unresolved reconciliation issues with cursor pagination' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [cursor_1.CursorQueryDto]),
    __metadata("design:returntype", Promise)
], OperationsController.prototype, "issues", null);
__decorate([
    (0, common_1.Get)('cases'),
    (0, swagger_1.ApiOperation)({ summary: 'List financial cases by creation date with cursor pagination' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [cursor_1.CursorQueryDto]),
    __metadata("design:returntype", Promise)
], OperationsController.prototype, "cases", null);
__decorate([
    (0, common_1.Get)('fees'),
    (0, swagger_1.ApiOperation)({ summary: 'List provider fees with cursor pagination' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [cursor_1.CursorQueryDto]),
    __metadata("design:returntype", Promise)
], OperationsController.prototype, "fees", null);
__decorate([
    (0, common_1.Post)('issues/:id/resolve'),
    (0, step_up_guard_1.SensitiveAction)('ADMIN'),
    (0, swagger_1.ApiOperation)({ summary: 'Record investigation resolution without changing balances' }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, InvestigationDto]),
    __metadata("design:returntype", void 0)
], OperationsController.prototype, "resolve", null);
exports.OperationsController = OperationsController = __decorate([
    (0, swagger_1.ApiTags)('financial-operations'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, admin_guard_1.AdminGuard),
    (0, common_1.UseInterceptors)(staff_read_audit_interceptor_1.StaffReadAuditInterceptor),
    (0, common_1.Controller)('admin/financial-operations'),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        reconciliation_service_1.ReconciliationService])
], OperationsController);
//# sourceMappingURL=operations.controller.js.map