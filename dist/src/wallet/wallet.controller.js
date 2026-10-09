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
exports.WalletController = void 0;
const admin_guard_1 = require("../auth/guards/admin.guard");
const financial_reason_dto_1 = require("../common/dto/financial-reason.dto");
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const wallet_service_1 = require("./wallet.service");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const fund_wallet_dto_1 = require("./dto/fund-wallet.dto");
const transfer_dto_1 = require("./dto/transfer.dto");
const transaction_history_query_dto_1 = require("./dto/transaction-history-query.dto");
const step_up_guard_1 = require("../security/step-up.guard");
let WalletController = class WalletController {
    walletService;
    constructor(walletService) {
        this.walletService = walletService;
    }
    async fundWallet(req, dto, idempotencyKey) {
        if (!idempotencyKey) {
            throw new common_1.BadRequestException('x-idempotency-key header is required');
        }
        return this.walletService.fundWallet(req.user.id, dto.amount, idempotencyKey);
    }
    async transfer(req, dto, idempotencyKey) {
        if (!idempotencyKey) {
            throw new common_1.BadRequestException('x-idempotency-key header is required');
        }
        return this.walletService.transferFunds(req.user.id, dto.receiverEmail, dto.amount, idempotencyKey, req.stepUpAuthVersion);
    }
    reverseTransaction(req, id, dto, key) {
        return this.walletService.reverseTransaction(req.user.id, id, dto.reason, key, req.stepUpAuthVersion);
    }
    async getTransactions(req, query) {
        return this.walletService.getTransactionHistory(req.user.id, query);
    }
};
exports.WalletController = WalletController;
__decorate([
    (0, common_1.Post)('fund'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: 'Simulate funding the wallet (development/test only)',
        description: 'Disabled by default. Requires explicit opt-in in a development or test environment.',
    }),
    (0, swagger_1.ApiHeader)({
        name: 'x-idempotency-key',
        description: 'Stable key for retries (1–200 letters, digits, . _ : -). Matching retries return the original response.',
        required: true,
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Wallet funded successfully.' }),
    (0, swagger_1.ApiResponse)({ status: 403, description: 'Simulated wallet funding is disabled.' }),
    (0, swagger_1.ApiResponse)({
        status: 409,
        description: 'Conflict - Key reused for a different request or a legacy reference.',
    }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Headers)('x-idempotency-key')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, fund_wallet_dto_1.FundWalletDto, String]),
    __metadata("design:returntype", Promise)
], WalletController.prototype, "fundWallet", null);
__decorate([
    (0, common_1.Post)('transfer'),
    (0, step_up_guard_1.SensitiveAction)('TRANSFER'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Transfer funds to another user' }),
    (0, swagger_1.ApiHeader)({
        name: 'x-idempotency-key',
        description: 'Stable key for retries (1–200 letters, digits, . _ : -). Matching retries return the original response.',
        required: true,
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Funds transferred successfully.' }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Bad Request - Insufficient balance.' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'Not Found - Receiver wallet not found.' }),
    (0, swagger_1.ApiResponse)({
        status: 409,
        description: 'Conflict - Key reused for a different request or a legacy reference.',
    }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Headers)('x-idempotency-key')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, transfer_dto_1.TransferDto, String]),
    __metadata("design:returntype", Promise)
], WalletController.prototype, "transfer", null);
__decorate([
    (0, common_1.Post)('transactions/:id/reverse'),
    (0, step_up_guard_1.SensitiveAction)('ADMIN'),
    (0, common_1.UseGuards)(admin_guard_1.AdminGuard),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOperation)({ summary: 'Reverse a full internal transfer or simulated funding (admin only)' }),
    (0, swagger_1.ApiHeader)({ name: 'x-idempotency-key', required: true }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.Headers)('x-idempotency-key')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, financial_reason_dto_1.FinancialReasonDto, String]),
    __metadata("design:returntype", void 0)
], WalletController.prototype, "reverseTransaction", null);
__decorate([
    (0, common_1.Get)('transactions'),
    (0, swagger_1.ApiOperation)({ summary: 'Get transaction history with pagination and filters' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Successfully retrieved transaction history.' }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, transaction_history_query_dto_1.TransactionHistoryQueryDto]),
    __metadata("design:returntype", Promise)
], WalletController.prototype, "getTransactions", null);
exports.WalletController = WalletController = __decorate([
    (0, swagger_1.ApiTags)('wallet'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Controller)('wallet'),
    __metadata("design:paramtypes", [wallet_service_1.WalletService])
], WalletController);
//# sourceMappingURL=wallet.controller.js.map