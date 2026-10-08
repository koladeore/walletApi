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
exports.FundingController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const fund_wallet_dto_1 = require("../wallet/dto/fund-wallet.dto");
const funding_service_1 = require("./funding.service");
const confirmation_service_1 = require("./confirmation.service");
let FundingController = class FundingController {
    funding;
    confirmation;
    constructor(funding, confirmation) {
        this.funding = funding;
        this.confirmation = confirmation;
    }
    async verify(req, reference) {
        await this.confirmation.confirm(reference, req.user.id);
        return this.funding.get(req.user.id, reference);
    }
    initialize(req, dto, key) {
        return this.funding.initialize(req.user.id, dto.amount, key);
    }
    get(req, reference) {
        return this.funding.get(req.user.id, reference);
    }
};
exports.FundingController = FundingController;
__decorate([
    (0, common_1.Post)(':reference/verify'),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOperation)({
        summary: 'Verify your payment with Paystack and credit a matching successful payment once',
    }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('reference')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], FundingController.prototype, "verify", null);
__decorate([
    (0, common_1.Post)('initialize'),
    (0, swagger_1.ApiOperation)({ summary: 'Initialize Paystack test checkout; does not credit the wallet' }),
    (0, swagger_1.ApiHeader)({
        name: 'x-idempotency-key',
        required: true,
        description: 'Reuse the same key for retries of the same funding request.',
    }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Headers)('x-idempotency-key')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, fund_wallet_dto_1.FundWalletDto, String]),
    __metadata("design:returntype", void 0)
], FundingController.prototype, "initialize", null);
__decorate([
    (0, common_1.Get)(':reference'),
    (0, swagger_1.ApiOperation)({
        summary: 'Read your stored funding request status (not live provider verification)',
    }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('reference')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], FundingController.prototype, "get", null);
exports.FundingController = FundingController = __decorate([
    (0, swagger_1.ApiTags)('wallet'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Controller)('wallet/funding'),
    __metadata("design:paramtypes", [funding_service_1.FundingService,
        confirmation_service_1.ConfirmationService])
], FundingController);
//# sourceMappingURL=funding.controller.js.map