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
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
const swagger_2 = require("@nestjs/swagger");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const admin_guard_1 = require("../auth/guards/admin.guard");
const prisma_service_1 = require("../prisma/prisma.service");
const reconciliation_service_1 = require("./reconciliation.service");
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
    run() {
        return this.reconciliation.run();
    }
    runs() {
        return this.prisma.reconciliationRun.findMany({ orderBy: { startedAt: 'desc' }, take: 100 });
    }
    issues() {
        return this.prisma.reconciliationIssue.findMany({
            where: { status: 'OPEN' },
            orderBy: { lastSeenAt: 'desc' },
            take: 100,
        });
    }
    async cases() {
        return (await this.prisma.financialCase.findMany({ orderBy: { updatedAt: 'desc' }, take: 100 })).map((row) => ({
            ...row,
            amountMinor: row.amountMinor.toString(),
            recoveredMinor: row.recoveredMinor.toString(),
            shortfallMinor: row.shortfallMinor.toString(),
        }));
    }
    async fees() {
        return (await this.prisma.providerFee.findMany({ orderBy: { createdAt: 'desc' }, take: 100 })).map((row) => ({ ...row, amountMinor: row.amountMinor.toString() }));
    }
    resolve(req, id, dto) {
        return this.prisma.$transaction(async (tx) => {
            await tx.$queryRaw `SELECT id FROM users WHERE id=${req.user.id} FOR SHARE`;
            const actor = await tx.user.findUnique({ where: { id: req.user.id } });
            if (!actor?.isActive || actor.closedAt || actor.role !== 'ADMIN')
                throw new common_1.ForbiddenException('Active administrator required');
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
    (0, swagger_1.ApiOperation)({ summary: 'Run provider and ledger reconciliation (admin)' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], OperationsController.prototype, "run", null);
__decorate([
    (0, common_1.Get)('runs'),
    (0, swagger_1.ApiOperation)({ summary: 'Read latest 100 reconciliation runs' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], OperationsController.prototype, "runs", null);
__decorate([
    (0, common_1.Get)('issues'),
    (0, swagger_1.ApiOperation)({ summary: 'Read latest 100 unresolved reconciliation issues' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], OperationsController.prototype, "issues", null);
__decorate([
    (0, common_1.Get)('cases'),
    (0, swagger_1.ApiOperation)({ summary: 'Read latest financial cases and recovery shortfalls' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], OperationsController.prototype, "cases", null);
__decorate([
    (0, common_1.Get)('fees'),
    (0, swagger_1.ApiOperation)({ summary: 'Read latest 100 verified business-borne provider fees' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], OperationsController.prototype, "fees", null);
__decorate([
    (0, common_1.Post)('issues/:id/resolve'),
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
    (0, common_1.Controller)('admin/financial-operations'),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        reconciliation_service_1.ReconciliationService])
], OperationsController);
//# sourceMappingURL=operations.controller.js.map